import {Composition} from "remotion";
import {ChatMotionOverlay} from "./components/ChatMotionOverlay";
import {chatSpec} from "./chatSpec";

export const RemotionRoot = () => {
  return (
    <Composition
      id="ChatMotionOverlay"
      component={ChatMotionOverlay}
      durationInFrames={chatSpec.durationInFrames}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{chatSpec}}
    />
  );
};
