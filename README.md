# Ridgeline Supply · MCP demo

An MCP server that connects Claude to a (fictional) distributor's back office: orders, invoices, stock and sales, with human approval before any write.

## Try it

- Server URL: `https://ridgeline-mcp.vercel.app/api/mcp`
- Public read key: `80248ebd3dd358e7eb8605ad4d2ab7c6`
- Operator key (needed for `request_follow_up_task`): on request.

**Claude:** Settings, Connectors, Add custom connector, paste the server URL, open Advanced and add the request header `Authorization: Bearer <key>`. On Claude's Free plan you can add one custom connector.

**Claude Code:**

```bash
claude mcp add --transport http ridgeline-demo https://ridgeline-mcp.vercel.app/api/mcp \
  --header "Authorization: Bearer 80248ebd3dd358e7eb8605ad4d2ab7c6"
```

## Example questions

- What's the status of order 1042?
- Which invoices are overdue?
- What do we need to reorder?
- How did sales go this month?

With the operator key you can also ask for a follow-up task for a customer. Claude gets back an approval link; nothing is written until a person opens it and approves.

![Approval page after clicking Approve](docs/claude-answer.png)

## Tools

| Tool | What it does | Access |
|---|---|---|
| `find_order` | One order with lines, total and invoice status | read |
| `list_unpaid_invoices` | Unpaid or overdue invoices, most overdue first, with total outstanding | read |
| `list_low_stock` | Products at or below reorder point, biggest shortfall first | read |
| `sales_summary` | Orders, revenue, top customers and products for a date range | read |
| `request_follow_up_task` | Creates a signed approval link for a follow-up task; due date from today to 365 days ahead | write (approval) |

## How it's built

A Next.js route (`app/api/mcp/route.ts`) using `mcp-handler`. `lib/erp.ts` stands in for the client's system. The data is fixed, and dates move with the clock so the demo always looks current. It covers roughly the last 75 days; `sales_summary` adds a note when you ask for an earlier range.

## Safety

- Bounded results (max 20 rows per list).
- Validated inputs on every tool.
- Separate read and write keys.
- Writes go through a signed approval link that expires after 24 hours. The approval page states that in a real deployment it sits behind the company login and records who approved. In this demo the link is a bearer link: anyone holding it can approve, and approving writes nothing.
- One structured log line per tool call.
- No raw SQL.

## Adapting it to a real system

1. Replace the functions in `lib/erp.ts` with calls to your API.
2. Swap `verifyKey` for OAuth with `withMcpAuth` and your identity provider.
3. Send the log line to your log store.

## Running cost

Vercel Hobby or Pro function invocations only. No database, and no LLM calls on the server: the user's own Claude does the reasoning.

## Compatibility

Tested with Claude (custom connector) and Claude Code. It uses standard MCP over Streamable HTTP. ChatGPT supports custom MCP apps on Business, Enterprise and Edu plans (not tested here).

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
npm test
```

## About

Demo data, fictional company. Concept project. Licensed under MIT.
