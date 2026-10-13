export const dynamic = "force-dynamic";
const REPO = "https://github.com/martin-minghetti/ridgeline-mcp";
export default function Home() {
  const url = `${process.env.PUBLIC_BASE_URL ?? ""}/api/mcp`;
  return (
    <main>
      <h1>Ridgeline Supply · MCP demo</h1>
      <p>An MCP server that connects Claude to the back office of a fictional distributor. Ask things like
        “What&apos;s the status of order 1042?”, “Which invoices are overdue?”, “What do we need to reorder?”
        or “How did sales go this month?”. Write actions need a human approval first.</p>
      <h2>Connect</h2>
      <p>Server URL: <code>{url}</code></p>
      <p>Send <code>Authorization: Bearer &lt;key&gt;</code>. Keys and setup steps for Claude and Claude Code are in the <a href={REPO}>README</a>.</p>
      <h2>Tools</h2>
      <ul>
        <li><code>find_order</code>: one order with lines, total and invoice status</li>
        <li><code>list_unpaid_invoices</code>: unpaid or overdue invoices, most overdue first</li>
        <li><code>list_low_stock</code>: products at or below reorder point</li>
        <li><code>sales_summary</code>: revenue and top customers/products for a date range</li>
        <li><code>request_follow_up_task</code>: creates an approval link, never writes on its own</li>
      </ul>
      <p><small>Demo data, fictional company. Source: <a href={REPO}>GitHub</a>.</small></p>
    </main>
  );
}
