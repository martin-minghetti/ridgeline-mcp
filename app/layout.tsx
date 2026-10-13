export const metadata = { title: "Ridgeline Supply · MCP demo", description: "Demo MCP server: Claude connected to a fictional distributor's back office." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "40px auto", padding: "0 16px", lineHeight: 1.55, color: "#1b1d21" }}>
        {children}
      </body>
    </html>
  );
}
