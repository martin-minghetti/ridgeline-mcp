export const dynamic = "force-dynamic";
const REPO = "https://github.com/martin-minghetti/ridgeline-mcp";
const QUESTIONS = [
  "What's the status of order 1042?",
  "Which invoices are overdue?",
  "What do we need to reorder?",
  "How did sales go this month?",
];
const TOOLS: [string, string, string][] = [
  ["find_order", "One order with lines, total and invoice status", "read"],
  ["list_unpaid_invoices", "Unpaid or overdue invoices, most overdue first", "read"],
  ["list_low_stock", "Products at or below reorder point", "read"],
  ["sales_summary", "Revenue, top customers and products for a date range", "read"],
  ["request_follow_up_task", "Prepares a follow-up task and returns an approval link", "write, needs approval"],
];

export default function Home() {
  const url = `${process.env.PUBLIC_BASE_URL ?? ""}/api/mcp`;
  // The read key is public on purpose (it is in the README); it can't write anything.
  const header = `Bearer ${process.env.DEMO_READ_KEY ?? "<read key from the README>"}`;
  return (
    <main>
      <header className="hero">
        <p className="eyebrow">MCP server demo</p>
        <h1>Ask Claude about your back office.</h1>
        <p className="lead">
          This MCP server connects Claude to the orders, invoices, stock and sales of Ridgeline Supply, a fictional
          distributor. Claude reads on its own. Anything it wants to write waits for a person to approve it.
        </p>
        <ul className="facts">
          <li>4 read tools</li>
          <li>1 write tool, approval first</li>
          <li>Works in claude.ai and Claude Code</li>
          <li>No database, no LLM on the server</li>
        </ul>
      </header>

      <section>
        <h2>What you can ask</h2>
        <ul className="questions">
          {QUESTIONS.map((q) => <li key={q}>“{q}”</li>)}
        </ul>
        <figure>
          <img className="tall" src="/claude-answer.png" width={1170} height={2000} alt="Claude in claude.ai answering “Which invoices are overdue and what should we reorder?” with a table of 13 overdue invoices" />
          <figcaption>A real answer in claude.ai, using this server.</figcaption>
        </figure>
      </section>

      <section>
        <h2>Connect it in claude.ai</h2>
        <ol className="steps">
          <li>Open Settings, then Connectors, then <b>Add custom connector</b>.</li>
          <li>Name it <code>ridgeline</code> and paste the server URL:<pre>{url}</pre></li>
          <li>Set authentication to <b>No sign-in</b>.</li>
          <li>Under request headers, add <code>Authorization</code> with this value:<pre>{header}</pre></li>
          <li>Start a chat, turn the connector on and ask one of the questions above.</li>
        </ol>
        <p className="note">The Free plan allows one custom connector. This key is read-only: the write tool answers with a permission error.</p>
        <p>Claude Code:</p>
        <pre className="cmd">{`claude mcp add --transport http ridgeline ${url} \\\n  --header "Authorization: ${header}"`}</pre>
      </section>

      <section>
        <h2>How approval works</h2>
        <ol className="flow">
          <li><b>Claude asks.</b> It calls <code>request_follow_up_task</code> with the customer, due date and note.</li>
          <li><b>The server signs a link.</b> Nothing is written. Claude gets back a link that expires in 24 hours.</li>
          <li><b>A person decides.</b> They open the link, review the task and click Approve. Only then would it be written.</li>
        </ol>
        <figure>
          <img src="/approval-page.png" width={780} height={612} alt="Approval page showing the task details after clicking Approve" />
          <figcaption>The approval page. In a real deployment it sits behind the company login and records who approved.</figcaption>
        </figure>
        <p className="note">Try it with the operator key (request it by opening an issue on <a href={REPO}>GitHub</a>): “Create a follow-up task for Granite Peak Mining about their overdue invoices.”</p>
        <p className="note">Read and write use separate keys. In claude.ai you can allow the read tools and keep the write tool on “Needs approval”, so there are two checks.</p>
      </section>

      <section>
        <h2>Tools</h2>
        <table>
          <tbody>
            {TOOLS.map(([name, what, access]) => (
              <tr key={name}><td><code>{name}</code></td><td>{what}</td><td className="access">{access}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer>Demo data, fictional company. Source and setup notes on <a href={REPO}>GitHub</a>.</footer>
    </main>
  );
}
