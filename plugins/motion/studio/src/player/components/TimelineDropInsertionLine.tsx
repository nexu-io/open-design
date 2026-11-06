interface TimelineDropInsertionLineProps {
  edge: "top" | "bottom";
  accentColor: string;
}

export function TimelineDropInsertionLine({ edge, accentColor }: TimelineDropInsertionLineProps) {
  return (
    <div
      className="absolute left-0 right-0 pointer-events-none"
      style={{
        top: edge === "top" ? -1 : undefined,
        bottom: edge === "bottom" ? -1 : undefined,
        height: 2,
        background: accentColor,
        boxShadow: `0 0 8px ${accentColor}`,
        zIndex: 30,
      }}
    >
      <span
        className="absolute rounded-full"
        style={{
          left: 0,
          top: -3,
          width: 8,
          height: 8,
          background: accentColor,
          boxShadow: `0 0 8px ${accentColor}`,
        }}
      />
    </div>
  );
}
