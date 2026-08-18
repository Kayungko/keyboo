import { useStyleStore } from "@/stores/useStyleStore";
import { KeyEvent } from "@/lib/types";
import { LaptopKeycap } from "./laptop";
import { LowProfileKeycap } from "./lowprofile";
import { MinimalKeycap } from "./minimal";
import { PBTKeycap } from "./pbt";

export interface KeycapProps {
  event: KeyEvent;
  isPressed: boolean;
  lastest: boolean;
}

const components = {
  minimal: MinimalKeycap,
  laptop: LaptopKeycap,
  lowprofile: LowProfileKeycap,
  pbt: PBTKeycap,
} as const;

export const Keycap = (props: KeycapProps) => {
  const style = useStyleStore((state) => state.appearance.style);
  const KeycapComponent = components[style];

  return <KeycapComponent {...props} />;
};
