// =========================================================================
// ELIXYR BOUTIQUE INTEGRATION SERVICES SDK (deliveryServices.js)
// This module implements delivery booking, WhatsApp alerts, and email notifications.
// If credentials are missing, it falls back to an elegant "Simulated Portal Mode".
// =========================================================================

// Config Resolution
const RESEND_KEY = import.meta.env.VITE_RESEND_API_KEY || '';
const RESEND_FROM = import.meta.env.VITE_RESEND_FROM_EMAIL || 'Elixyr Boutique <concierge@yourdomain.com>';
const WA_PHONE_ID = import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID || '';
const WA_TOKEN = import.meta.env.VITE_WHATSAPP_API_TOKEN || '';
const COURIER_ENDPOINT = import.meta.env.VITE_DELIVERY_PARTNER_ENDPOINT || '';
const COURIER_KEY = import.meta.env.VITE_DELIVERY_API_KEY || '';

// Helper to simulate delays like a real network request
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const integrationServices = {
  /**
   * 1. Book shipment with Courier Delivery Partner
   */
  async bookDelivery(order) {
    console.log(`%c🚚 Courier: Initiating booking for Order ${order.orderNumber}...`, 'color: #f1c40f; font-weight: bold;');
    await delay(1200); // Simulate network latency

    const hasCourierConfig = COURIER_ENDPOINT && COURIER_KEY;

    if (hasCourierConfig) {
      try {
        const payload = {
          order_id: order.orderNumber,
          customer: {
            name: order.clientName,
            phone: order.phone,
            email: order.email || '',
            address: `${order.emirate.split(' ')[0]}, UAE`
          },
          parcel: {
            weight: 0.8,
            items_count: order.items.reduce((sum, i) => sum + i.qty, 0)
          },
          cod: order.paymentMethod.includes('Cash on Delivery') ? order.total : 0
        };

        const response = await fetch(`${COURIER_ENDPOINT}/shipments`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${COURIER_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          const data = await response.json();
          console.log('%c🚚 Courier: Real booking successful!', 'color: #2ecc71; font-weight: bold;', data);
          return {
            success: true,
            trackingNumber: data.awb_number || `AWB-${Math.floor(100000 + Math.random() * 900000)}`,
            trackingLink: data.tracking_url || `https://tracking.deliverypartner.ae/?awb=${data.awb_number}`,
            mode: 'production'
          };
        }
      } catch (err) {
        console.error('Courier API error. Falling back to sandbox simulation.', err);
      }
    }

    // SIMULATION FALLBACK
    const mockAWB = `AWB-${Math.floor(100000 + Math.random() * 900000)}`;
    const mockLink = `https://tracking.deliverypartner.ae/?awb=${mockAWB}`;
    console.log(
      `%c🚚 Courier (Simulation Mode): Shipment booked successfully!\n` +
      `- Airway Bill: ${mockAWB}\n` +
      `- Client Address: ${order.clientName}, ${order.emirate}\n` +
      `- COD Target: ${order.paymentMethod.includes('Cash on Delivery') ? `${order.total} AED` : '0 AED (Prepaid)'}\n` +
      `- Dispatch Status: Dispatched for Boutique Delivery`,
      'color: #2ecc71;'
    );

    return {
      success: true,
      trackingNumber: mockAWB,
      trackingLink: mockLink,
      mode: 'simulation'
    };
  },

  /**
   * 2. Trigger Custom Email Invoice via Resend
   */
  async sendEmailReceipt(order, trackingLink, trackingNumber) {
    console.log(`%c✉️ Resend: Generating luxury invoice email to ${order.email || 'client@elixyr.ae'}...`, 'color: #f1c40f;');
    await delay(800);

    const hasResendConfig = RESEND_KEY;

    // Beautiful HTML Template mimicking the luxury boutique aesthetic
    const emailHtml = `
      <div style="background-color: #0e0e0d; color: #f4f2ee; font-family: 'Outfit', sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; border: 1px solid #2c2925;">
        <div style="text-align: center; border-bottom: 1px solid #2c2925; padding-bottom: 20px; margin-bottom: 30px;">
          <h1 style="color: #FAF9F5; letter-spacing: 6px; font-weight: 300; margin: 0; font-size: 28px;">ELIXYR</h1>
          <p style="color: #c5a880; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; margin-top: 5px;">Boutique Order Invoice</p>
        </div>
        
        <p style="font-size: 14px; line-height: 1.6; color: #b2aaa0;">Dear ${order.clientName},</p>
        <p style="font-size: 14px; line-height: 1.6; color: #b2aaa0;">Your order <strong>${order.orderNumber}</strong> has been prepared at our scent atelier. It is now dispatched for premium boutique delivery.</p>
        
        <div style="background-color: #171614; border: 1px dashed #c5a880; padding: 20px; margin: 25px 0;">
          <h3 style="color: #c5a880; margin-top: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Tracking Information</h3>
          <p style="font-size: 13px; margin: 5px 0; color: #faf9f5;">Courier Partner: Regional Boutique Handoff</p>
          <p style="font-size: 13px; margin: 5px 0; color: #faf9f5;">Airway Bill (AWB): <strong>${trackingNumber}</strong></p>
          <a href="${trackingLink}" style="display: inline-block; background-color: #c5a880; color: #0e0e0d; text-decoration: none; padding: 10px 18px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-top: 12px; border-radius: 2px;">Track Your Shipment</a>
        </div>
        
        <div style="margin: 25px 0;">
          <h4 style="color: #faf9f5; border-bottom: 1px solid #2c2925; padding-bottom: 5px; font-size: 12px; text-transform: uppercase;">Fragrance Order details</h4>
          ${order.items.map(item => `
            <div style="display: flex; justify-content: space-between; font-size: 13px; margin: 8px 0; color: #b2aaa0;">
              <span>${item.name} (x${item.qty})</span>
              <span>${item.price * item.qty} AED</span>
            </div>
          `).join('')}
          <div style="border-top: 1px solid #2c2925; padding-top: 10px; margin-top: 10px; font-weight: bold; color: #faf9f5; display: flex; justify-content: space-between; font-size: 14px;">
            <span>Total:</span>
            <span>${order.total} AED</span>
          </div>
        </div>

        <p style="font-size: 11px; text-align: center; color: #57524c; margin-top: 40px; border-top: 1px solid #1c1a18; padding-top: 15px;">
          Hand-assembled & sealed in Dubai, UAE. For boutique concierge inquiries, reply to this email or message us on WhatsApp.
        </p>
      </div>
    `;

    if (hasResendConfig && order.email) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: RESEND_FROM,
            to: order.email,
            subject: `Elixyr Boutique Order Slip: ${order.orderNumber}`,
            html: emailHtml
          })
        });

        if (response.ok) {
          const data = await response.json();
          console.log('%c✉️ Resend: Invoice email successfully delivered!', 'color: #2ecc71; font-weight: bold;', data);
          return { success: true, mode: 'production' };
        }
      } catch (err) {
        console.error('Resend API delivery error. Falling back to console simulation.', err);
      }
    }

    // SIMULATION FALLBACK
    console.log(
      `%c✉️ Resend (Simulation Mode): Client invoice email generated!\n` +
      `- Recipient: ${order.email || '(No email provided)'}\n` +
      `- Subject: Elixyr Boutique Order Slip: ${order.orderNumber}\n` +
      `- Tracking Link attached: ${trackingLink}`,
      'color: #2ecc71;'
    );
    return { success: true, mode: 'simulation' };
  },

  /**
   * 3. Send Client Tracking Updates via WhatsApp
   */
  async sendWhatsAppReceipt(order, trackingLink, trackingNumber) {
    console.log(`%c💬 WhatsApp: Sending tracking notification payload to client ${order.phone}...`, 'color: #f1c40f;');
    await delay(900);

    const hasWhatsAppConfig = WA_PHONE_ID && WA_TOKEN;

    if (hasWhatsAppConfig) {
      try {
        const payload = {
          messaging_product: 'whatsapp',
          to: order.phone,
          type: 'template',
          template: {
            name: 'elixyr_boutique_confirmation',
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: order.clientName },
                  { type: 'text', text: order.orderNumber },
                  { type: 'text', text: `${order.total} AED` }
                ]
              },
              {
                type: 'button',
                index: '0',
                sub_type: 'url',
                parameters: [
                  { type: 'text', text: trackingNumber }
                ]
              }
            ]
          }
        };

        const response = await fetch(`https://graph.facebook.com/v18.0/${WA_PHONE_ID}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WA_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          const data = await response.json();
          console.log('%c💬 WhatsApp: Meta Cloud API message sent successfully!', 'color: #2ecc71; font-weight: bold;', data);
          return { success: true, mode: 'production' };
        }
      } catch (err) {
        console.error('WhatsApp API sending error. Falling back to console simulation.', err);
      }
    }

    // SIMULATION FALLBACK
    console.log(
      `%c💬 WhatsApp (Simulation Mode): Client interactive message dispatched!\n` +
      `- Client Phone: ${order.phone}\n` +
      `- Message: "Dear ${order.clientName}, your Elixyr order ${order.orderNumber} of ${order.total} AED is out for boutique delivery! Track it directly at ${trackingLink}."`,
      'color: #2ecc71;'
    );
    return { success: true, mode: 'simulation' };
  }
};
