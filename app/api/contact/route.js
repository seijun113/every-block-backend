import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth";

// POST /api/contact
// Body: { name, email, topic, message }
// Sends the contact-page form to the site's inbox via Resend. Requires a
// RESEND_API_KEY env var (from https://resend.com) set in Vercel.
const CONTACT_INBOX = "everblockhasastory@gmail.com";

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  const name = String(body?.name || "").trim();
  const email = String(body?.email || "").trim();
  const topic = String(body?.topic || "General question").trim();
  const message = String(body?.message || "").trim();

  if (!name || !email || !message) {
    return jsonError(400, "Name, email, and message are required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError(400, "Please enter a valid email address.");
  }
  if (message.length > 5000) {
    return jsonError(400, "Message is too long.");
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return jsonError(500, "Contact form isn't configured yet. Please email us directly.");
  }

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Every Block Has a Story <onboarding@resend.dev>",
      to: [CONTACT_INBOX],
      reply_to: email,
      subject: `[Contact] ${topic} — ${name}`,
      html:
        `<p><strong>From:</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p>` +
        `<p><strong>Topic:</strong> ${escapeHtml(topic)}</p>` +
        `<p><strong>Message:</strong></p>` +
        `<p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`,
    }),
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text().catch(() => "");
    return jsonError(502, `Could not send message: ${errText || resendRes.statusText}`);
  }

  return NextResponse.json({ message: "Message sent." });
}
