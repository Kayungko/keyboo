# 生成 PNG 图标,绘制函数见 icon-draw.ps1;几何同源 tools/keyboo-icon.svg
# - 32/128/256:bundle 打包资源
# - 64:托盘图标(高 DPI 下比 32 档清晰)
# - 512:icon.png 主图标(bundle.icon,安装包/资源管理器大图)
. "$PSScriptRoot\icon-draw.ps1"

$dir = "C:\Users\admin\AppData\Local\.aimana\projects\AIMana\keyboo\src-tauri\icons"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

foreach ($pair in @(@(32, "32x32.png"), @(64, "64x64.png"), @(128, "128x128.png"), @(256, "128x128@2x.png"), @(512, "icon.png"))) {
    $bmp = New-KeybooBitmap $pair[0]
    $bmp.Save("$dir\$($pair[1])", [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

Get-ChildItem $dir -Filter *.png | Select-Object Name, Length
