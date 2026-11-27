// De mail versturen. Twee wegen: rechtstreeks via Microsoft Graph vanuit een
// postvak in Outlook, of als JSON naar een webhook (Power Automate, n8n, Make
// of Teams). Zonder instellingen wordt er niets verstuurd.

import { haal, haalJson } from "./http.mjs";

const GRAPH_VELDEN = ["RADAR_TENANT_ID", "RADAR_CLIENT_ID", "RADAR_CLIENT_SECRET", "RADAR_MAIL_VAN", "RADAR_MAIL_AAN"];

/** Welke weg is ingesteld: "graph", "webhook" of null. */
export function verzendwijze(omgeving = process.env) {
  const aanwezig = GRAPH_VELDEN.filter((v) => omgeving[v]);
  if (aanwezig.length === GRAPH_VELDEN.length) return "graph";
  if (aanwezig.length > 0) {
    const mist = GRAPH_VELDEN.filter((v) => !omgeving[v]).join(", ");
    throw new Error(`Outlook is half ingesteld. Deze waarden ontbreken: ${mist}.`);
  }
  if (omgeving.RADAR_WEBHOOK_URL) return "webhook";
  return null;
}

/** Verstuurt de mail via Microsoft Graph (toestemming Mail.Send voor de app). */
export async function verstuurViaGraph(mail, { omgeving = process.env, fetchFn } = {}) {
  const token = await haalJson(
    `https://login.microsoftonline.com/${encodeURIComponent(omgeving.RADAR_TENANT_ID)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: omgeving.RADAR_CLIENT_ID,
        client_secret: omgeving.RADAR_CLIENT_SECRET,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }).toString(),
      fetchFn,
      pogingen: 2,
    },
  );
  const aan = omgeving.RADAR_MAIL_AAN.split(/[,;]/)
    .map((a) => a.trim())
    .filter(Boolean);
  await haal(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(omgeving.RADAR_MAIL_VAN)}/sendMail`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: mail.onderwerp,
          body: { contentType: "HTML", content: mail.html },
          toRecipients: aan.map((address) => ({ emailAddress: { address } })),
        },
        saveToSentItems: false,
      }),
      fetchFn,
      pogingen: 1,
    },
  );
  return `verstuurd naar ${aan.length} ${aan.length === 1 ? "adres" : "adressen"} via Outlook`;
}

/** Stuurt de mail als JSON naar een webhook. */
export async function verstuurViaWebhook(mail, { omgeving = process.env, fetchFn } = {}) {
  await haal(omgeving.RADAR_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      onderwerp: mail.onderwerp,
      status: mail.status,
      html: mail.html,
      tekst: mail.tekst,
      cijfers: mail.cijfers,
    }),
    fetchFn,
    pogingen: 2,
  });
  return "verstuurd naar de webhook";
}

export async function verstuur(mail, opties = {}) {
  const wijze = verzendwijze(opties.omgeving ?? process.env);
  if (wijze === "graph") return verstuurViaGraph(mail, opties);
  if (wijze === "webhook") return verstuurViaWebhook(mail, opties);
  return null;
}
