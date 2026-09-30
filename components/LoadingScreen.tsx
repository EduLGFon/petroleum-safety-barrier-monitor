// Loading screen - Aurora mesh splash shown while the island hydrates.
// This is why it exists: covers first paint with progress until onDone,
// already dressed in the interface identity so there is no visual pop.
import { SplashBackground } from "./loading/SplashBackground.tsx";
import { useFakeProgress } from "./loading/useFakeProgress.ts";
import { SplashCard } from "./loading/SplashCard.tsx";
import { AURORA } from "../lib/aurora.ts";

interface Props {
  onDone: () => void;
  companyName: string;
}

// LoadingScreen: full-screen splash with eased progress that fades out before onDone.
export function LoadingScreen({ onDone, companyName }: Props) {
  const { progress, ready, exit, msg } = useFakeProgress(onDone);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        // Opaque by construction: the solid base paints even when the
        // bundled stylesheet (which defines --au-*) has not loaded yet.
        // Using backgroundImage (not the `background` shorthand) avoids
        // resetting the solid color when the var() is still undefined,
        // so the dashboard behind can never bleed through and overlap
        // the splash title ("words over words").
        backgroundColor: "#050a18",
        backgroundImage: AURORA.page,
        opacity: exit ? 0 : 1,
        transition: "opacity .55s cubic-bezier(0.4,0,1,1)",
        pointerEvents: exit ? "none" : "auto",
        padding: 16,
        boxSizing: "border-box",
        overflowY: "auto",
      }}
    >
      {/* Background */}
      <SplashBackground />

      {/* Card */}
      <SplashCard
        progress={progress}
        ready={ready}
        msg={msg}
        companyName={companyName}
      />
    </div>
  );
}
