/* Vercel serverless function: reads a supplier bill with Google Gemini.
   The key lives ONLY in the Vercel environment variable GEMINI_API_KEY (never in the website code). */
module.exports = async function (req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') return res.status(405).send(JSON.stringify({ error: { message: 'POST only' } }));
  var key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(501).send(JSON.stringify({ error: { message: 'GEMINI_API_KEY is not set on the server' } }));
  var body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || !Array.isArray(body.contents) || body.contents.length !== 1) return res.status(400).send(JSON.stringify({ error: { message: 'Bad request' } }));
  var model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  try {
    var r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: body.contents, generationConfig: { responseMimeType: 'application/json', temperature: 0 } })
    });
    var text = await r.text();
    res.status(r.status).send(text);
  } catch (e) {
    res.status(502).send(JSON.stringify({ error: { message: 'Could not reach the AI service' } }));
  }
};
module.exports.config = { maxDuration: 60 };
