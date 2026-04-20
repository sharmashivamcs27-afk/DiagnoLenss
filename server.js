const express    = require('express');
const cors       = require('cors');
const twilio     = require('twilio');
const { google } = require('googleapis');

const app    = express();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

app.use(cors());
app.use(express.json());

app.post('/send-sms', async (req, res) => {
  try {
    const msg = await client.messages.create({
      body: req.body.message,
      from: process.env.TWILIO_FROM_PHONE,
      to:   req.body.to
    });
    res.json({ success: true, sid: msg.sid });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/send-whatsapp', async (req, res) => {
  try {
    const msg = await client.messages.create({
      body: req.body.message,
      from: `whatsapp:${process.env.TWILIO_FROM_PHONE}`,
      to:   `whatsapp:${req.body.to}`
    });
    res.json({ success: true, sid: msg.sid });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/make-call', async (req, res) => {
  const { to, name, token, date, time } = req.body;
  const twiml = `<Response>
    <Say voice="Polly.Aditi" language="en-IN">
      Hello ${name}. This is DiagnoLens.
      Your token number is ${token}.
      Your appointment is on ${date} at ${time}.
      Please arrive 10 minutes early. Thank you.
    </Say>
  </Response>`;
  try {
    const call = await client.calls.create({
      twiml,
      to,
      from: process.env.TWILIO_FROM_PHONE
    });
    res.json({ success: true, callSid: call.sid });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/save-to-sheets', async (req, res) => {
  const { token, patientName, phone, email, hospital, dept, city, date, slot, bookedAt } = req.body;
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key:  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId:    process.env.GOOGLE_SPREADSHEET_ID,
      range:            'Sheet1!A:J',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[ token, patientName, phone, email, hospital, dept, city, date, slot, bookedAt ]]
      }
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Sheets error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`DiagnoLens backend running on port ${PORT}`));