/**
 * The Gmail bridge: a Google Apps Script that runs in the owner's own Google account, finds
 * NPTEL emails every hour and posts them to Lume. Apps Script reads Gmail with the owner's
 * permission, so Lume needs no Google OAuth client and no tokens that expire.
 *
 * Settings hands this out pre-filled with the app's URL and CRON_SECRET.
 */
export function bridgeScript(appUrl: string, secret: string): string {
  return `// Lume Gmail bridge. Sends your NPTEL emails to Lume every hour, so their deadlines show up there.
// It only reads emails that match the searches below, and only sends them to your own Lume.
// Setup: paste this into a new project at script.google.com, choose "setup" above, and click Run once.

const LUME_URL = ${JSON.stringify(appUrl)};
const LUME_SECRET = ${JSON.stringify(secret)};

// Which emails count for which source. Add IITM BS here later, e.g. iitm: 'from:(study.iitm.ac.in)'.
const SEARCHES = {
  nptel: 'from:(nptel.ac.in OR nptel.iitm.ac.in OR swayam.gov.in)',
};

function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendToLume').timeBased().everyHours(1).create();
  PropertiesService.getScriptProperties().deleteProperty('caughtUp');
  // First run: catch up on the last 60 days. Gemini reads a limited number per minute, so pause between rounds.
  for (let round = 0; round < 5; round++) {
    const result = sendToLume();
    if (!result || result.waiting === 0 || result.read === 0) break; // done, or stuck (see the log)
    Utilities.sleep(65 * 1000);
  }
}

function sendToLume() {
  const props = PropertiesService.getScriptProperties();
  const range = props.getProperty('caughtUp') ? 'newer_than:3d' : 'newer_than:60d';
  const emails = [];
  Object.keys(SEARCHES).forEach((source) => {
    GmailApp.search(SEARCHES[source] + ' ' + range, 0, 100).forEach((thread) => {
      thread.getMessages().forEach((m) => {
        emails.push({
          id: m.getId(),
          source: source,
          from: m.getFrom(),
          subject: m.getSubject(),
          date: m.getDate().toISOString(),
          body: m.getPlainBody().slice(0, 12000),
        });
      });
    });
  });

  const res = UrlFetchApp.fetch(LUME_URL + '/api/ingest/email', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + LUME_SECRET },
    payload: JSON.stringify({ emails: emails }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    console.error('Lume answered ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
    return null;
  }
  const result = JSON.parse(res.getContentText());
  console.log('Sent ' + emails.length + ' emails; ' + result.read + ' newly read, ' + result.deadlinesFound + ' deadlines found, ' + result.waiting + ' waiting.');
  if (result.problem) console.warn('Lume could not read some emails yet: ' + result.problem);
  if (result.waiting === 0) props.setProperty('caughtUp', '1');
  return result;
}
`;
}
