import "./globals.css";
export const metadata = { title: "Ridgeline Supply · MCP demo", description: "Demo MCP server: Claude connected to a fictional distributor's back office, with human approval before any write." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
