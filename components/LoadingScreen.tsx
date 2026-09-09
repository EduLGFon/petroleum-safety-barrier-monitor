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
        background: AURORA.page,
        backgroundColor: AURORA.pageBase,
        opacity: exit ? 0 : 1,
        transition: "opacity .55s cubic-bezier(0.4,0,1,1)",
        pointerEvents: exit ? "none" : "auto",
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

      {/* Footer */}
      <div
        style={{
          position: "absolute",
          bottom: 24,
          fontSize: "var(--d-micro)",
          color: AURORA.sub,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          animation: "fadeInFast .8s .4s both",
        }}
      >
        {companyName
          ? `${companyName} · Segurança Operacional`
          : "Segurança Operacional"}
      </div>
    </div>
  );
}
