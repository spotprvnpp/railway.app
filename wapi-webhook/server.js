const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

// MySQL pool to your cPanel
const pool = mysql.createPool({
  host: process.env.DB_HOST, // e.g., 77.37.45.12 or yourdomain.com
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: 3306,
  ssl: { rejectUnauthorized: false }
});

// 1. Meta verification (GET)
app.get('/api/webhook/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    console.log('WEBHOOK VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// 2. Receive messages (POST)
app.post('/api/webhook/whatsapp', async (req, res) => {
  try {
    const body = req.body;
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.field === 'messages') {
            const messages = change.value.messages;
            if (messages) {
              for (const msg of messages) {
                await pool.execute(
                  `INSERT INTO messages (waba_id, from_number, to_number, message_body, message_type, direction, raw_json)
                   VALUES (?,?,?,?,?, 'in',?)`,
                  [
                    change.value.metadata.phone_number_id,
                    msg.from,
                    change.value.metadata.display_phone_number,
                    msg.text?.body || msg.type,
                    msg.type,
                    JSON.stringify(msg)
                  ]
                );
                // Save contact
                await pool.execute(
                  `INSERT IGNORE INTO contacts (phone, name) VALUES (?,?)`,
                  [msg.from, change.value.contacts?.[0]?.profile?.name || '']
                );
                console.log('Saved message from', msg.from);
              }
            }
          }
        }
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(200); // Always 200 to Meta
  }
});

app.get('/', (req,res)=>res.send('WAPI Webhook Live - Connected to cPanel DB'));

app.listen(process.env.PORT || 3000, ()=>console.log('Running'));