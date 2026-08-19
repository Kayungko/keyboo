//! 托盘图标:按系统实际小图标尺寸,从内嵌 icon.ico 选精确尺寸条目。
//!
//! 固定用 64x64.png 做托盘图会被 shell 下采样发糊;ico 内含 16~64 的逐尺寸
//! 优化位图(分边距/笔画参数 + 4x 超采样抗锯齿),按 SM_CXSMICON 精确命中,
//! 与任务栏/标题栏走 exe 图标资源同一套多尺寸机制。

use tauri::{image::Image, include_image};

const ICO: &[u8] = include_bytes!("../icons/icon.ico");

fn u16_at(b: &[u8], o: usize) -> u16 {
    u16::from_le_bytes([b[o], b[o + 1]])
}
fn u32_at(b: &[u8], o: usize) -> u32 {
    u32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]])
}

fn pick_raw_entry(target: u32) -> Option<&'static [u8]> {
    if ICO.len() < 6 || u16_at(ICO, 0) != 0 || u16_at(ICO, 2) != 1 {
        return None;
    }
    let count = u16_at(ICO, 4) as usize;
    let mut best: Option<(i64, usize, usize)> = None;
    for i in 0..count {
        let d = 6 + i * 16;
        if ICO.len() < d + 16 {
            break;
        }
        let w = if ICO[d] == 0 { 256 } else { ICO[d] as u32 };
        let size = u32_at(ICO, d + 8) as usize;
        let off = u32_at(ICO, d + 12) as usize;
        let Some(end) = off.checked_add(size) else {
            continue;
        };
        if end > ICO.len() {
            continue;
        }
        // 距离相同时优先较大的条目，避免 Windows 再做放大插值。
        let score = (w as i64 - target as i64).abs() * 2 + i64::from(w < target);
        if best.map_or(true, |(best_score, _, _)| score < best_score) {
            best = Some((score, off, end));
        }
    }
    let (_, off, end) = best?;
    Some(&ICO[off..end])
}

/// 系统当前小图标实际像素尺寸(DPI 缩放后,即托盘/标题栏槽位真实大小)
fn system_small_icon_size() -> u32 {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSMICON};
        let v = unsafe { GetSystemMetrics(SM_CXSMICON) };
        if v > 0 {
            return v as u32;
        }
    }
    32
}

/// 从 ico 选最接近 target 的经典 BMP 条目,解码为 top-down RGBA
fn pick_entry(target: u32) -> Option<(u32, u32, Vec<u8>)> {
    if ICO.len() < 6 || u16_at(ICO, 0) != 0 || u16_at(ICO, 2) != 1 {
        return None;
    }
    let count = u16_at(ICO, 4) as usize;
    let mut best: Option<(i64, u32, usize)> = None; // (与目标差距, 宽, 数据偏移)
    for i in 0..count {
        let d = 6 + i * 16;
        if ICO.len() < d + 16 {
            break;
        }
        let w = if ICO[d] == 0 { 256 } else { ICO[d] as u32 };
        let off = u32_at(ICO, d + 12) as usize;
        // PNG 条目(128/256)以 0x89 开头,托盘用小尺寸,跳过
        if ICO.len() <= off || ICO[off] == 0x89 {
            continue;
        }
        let dist = (w as i64 - target as i64).abs();
        if best.map_or(true, |(bd, _, _)| dist < bd) {
            best = Some((dist, w, off));
        }
    }
    let (_, w, off) = best?;
    // BITMAPINFOHEADER 40 字节,随后 bottom-up BGRA 像素
    let px = off + 40;
    let n = w as usize;
    let need = n * n * 4;
    if ICO.len() < px + need {
        return None;
    }
    let mut rgba = vec![0u8; need];
    for row in 0..n {
        for col in 0..n {
            let src = px + ((n - 1 - row) * n + col) * 4;
            let dst = (row * n + col) * 4;
            // BGRA → RGBA
            rgba[dst] = ICO[src + 2];
            rgba[dst + 1] = ICO[src + 1];
            rgba[dst + 2] = ICO[src];
            rgba[dst + 3] = ICO[src + 3];
        }
    }
    Some((w, w, rgba))
}

/// 托盘图标:精确尺寸条目;解析失败回落编译期内嵌 64 图
pub fn tray_image() -> Image<'static> {
    let target = system_small_icon_size();
    if let Some((w, h, rgba)) = pick_entry(target) {
        return Image::new_owned(rgba, w, h);
    }
    include_image!("icons/64x64.png")
}

/// 设置窗口需要两套原生 HICON：
/// - ICON_SMALL 给标题栏；
/// - ICON_BIG 给任务栏/Alt-Tab。
///
/// Tauri 默认只解码 ico 的第一项；本项目第一项是 16px，因此任务栏会把它放大发糊。
#[cfg(target_os = "windows")]
pub struct WindowIconHandles {
    small: isize,
    big: isize,
}

#[cfg(target_os = "windows")]
impl Drop for WindowIconHandles {
    fn drop(&mut self) {
        use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, HICON};

        unsafe {
            let _ = DestroyIcon(HICON(self.small as *mut core::ffi::c_void));
            let _ = DestroyIcon(HICON(self.big as *mut core::ffi::c_void));
        }
    }
}

#[cfg(target_os = "windows")]
pub fn set_window_icons(window: &tauri::WebviewWindow) -> Result<WindowIconHandles, String> {
    use windows::Win32::{
        Foundation::{LPARAM, WPARAM},
        UI::{
            HiDpi::{GetDpiForWindow, GetSystemMetricsForDpi},
            WindowsAndMessaging::{
                CreateIconFromResourceEx, DestroyIcon, SendMessageW, ICON_BIG, ICON_SMALL,
                LR_DEFAULTCOLOR, SM_CXSMICON, SM_CYSMICON, WM_SETICON,
            },
        },
    };

    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    unsafe {
        let dpi = GetDpiForWindow(hwnd).max(96);
        let small_w = GetSystemMetricsForDpi(SM_CXSMICON, dpi).max(1);
        let small_h = GetSystemMetricsForDpi(SM_CYSMICON, dpi).max(1);
        // Windows 11 任务栏的目标尺寸是 24px@100%，而 SM_CXICON 是旧式
        // 32px@100% 的“大图标”指标。传 32/40px 会被 Shell 再缩到 24/30px，
        // 连同资源自身安全边距一起造成视觉尺寸偏小。
        let taskbar_size = ((24 * dpi + 48) / 96) as i32;
        let big_w = taskbar_size.max(1);
        let big_h = taskbar_size.max(1);

        let small_bits = pick_raw_entry(small_w as u32)
            .ok_or_else(|| format!("no ico entry for {small_w}x{small_h}"))?;
        let big_bits = pick_raw_entry(big_w as u32)
            .ok_or_else(|| format!("no ico entry for {big_w}x{big_h}"))?;

        let small = CreateIconFromResourceEx(
            small_bits,
            true,
            0x0003_0000,
            small_w,
            small_h,
            LR_DEFAULTCOLOR,
        )
        .map_err(|e| e.to_string())?;
        let big = match CreateIconFromResourceEx(
            big_bits,
            true,
            0x0003_0000,
            big_w,
            big_h,
            LR_DEFAULTCOLOR,
        ) {
            Ok(icon) => icon,
            Err(error) => {
                let _ = DestroyIcon(small);
                return Err(error.to_string());
            }
        };

        SendMessageW(
            hwnd,
            WM_SETICON,
            Some(WPARAM(ICON_SMALL as usize)),
            Some(LPARAM(small.0 as isize)),
        );
        SendMessageW(
            hwnd,
            WM_SETICON,
            Some(WPARAM(ICON_BIG as usize)),
            Some(LPARAM(big.0 as isize)),
        );

        Ok(WindowIconHandles {
            small: small.0 as isize,
            big: big.0 as isize,
        })
    }
}

#[cfg(target_os = "windows")]
pub fn clear_window_icons(window: &tauri::Window) {
    use windows::Win32::{
        Foundation::{LPARAM, WPARAM},
        UI::WindowsAndMessaging::{SendMessageW, ICON_BIG, ICON_SMALL, WM_SETICON},
    };

    if let Ok(hwnd) = window.hwnd() {
        unsafe {
            SendMessageW(
                hwnd,
                WM_SETICON,
                Some(WPARAM(ICON_SMALL as usize)),
                Some(LPARAM(0)),
            );
            SendMessageW(
                hwnd,
                WM_SETICON,
                Some(WPARAM(ICON_BIG as usize)),
                Some(LPARAM(0)),
            );
        }
    }
}
