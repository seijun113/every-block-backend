export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 40, maxWidth: 640 }}>
      <h1>Every Block Has a Story — API</h1>
      <p>
        This is a backend API only, with no site of its own. See the routes
        under <code>/api/*</code> — auth, Shopify purchase verification,
        Cloudflare Stream uploads, and video listing.
      </p>
    </main>
  );
}
