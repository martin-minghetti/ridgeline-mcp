const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const formatMoney = (cents: number) => usd.format(cents / 100);
export const formatDate = (d: Date) => d.toISOString().slice(0, 10);
