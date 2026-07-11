import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WHATSAPP_API = "https://graph.facebook.com/v23.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function resolveAccount(supabase, conversationId, project, phoneNumberIdFromConv) {
  if (phoneNumberIdFromConv) {
    const { data: pn } = await supabase
      .from("whatsapp_accounts")
      .select("*")
      .eq("phone_number_id", phoneNumberIdFromConv)
      .eq("is_active", true)
      .maybeSingle();
    if (pn) return pn;
  }

  if (project) {
    const { data: acc } = await supabase
      .from("whatsapp_accounts")
      .select("*")
      .eq("project", project)
      .eq("is_active", true)
      .maybeSingle();
    if (acc) return acc;
  }

  const { data: defaultAcc } = await supabase
    .from("whatsapp_accounts")
    .select("*")
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();
  if (defaultAcc) return defaultAcc;

  const { data: anyAcc } = await supabase
    .from("whatsapp_accounts")
    .select("*")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return anyAcc;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { phone, conversationId, templateName, language, params, headerMediaUrl, project } = await req.json();

    if (!templateName || (!phone && !conversationId)) {
      return new Response(
        JSON.stringify({ error: "templateName and phone (or conversationId) are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    const apiKey = req.headers.get("x-api-key");

    if (!authHeader && !apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let tenantId = null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (apiKey) {
      const { data: keyRecord } = await supabase
        .from("api_keys")
        .select("id, tenant_id, active")
        .eq("key", apiKey)
        .maybeSingle();
      if (!keyRecord || !keyRecord.active) {
        return new Response(JSON.stringify({ error: "Invalid or inactive API key" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      tenantId = keyRecord.tenant_id;
      await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRecord.id);
    } else {
      const userSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userSupabase.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: profile } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
      tenantId = profile?.tenant_id || null;
    }

    if (!tenantId) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let contact = null;
    let conversation = null;

    if (conversationId) {
      const { data: conv } = await supabase
        .from("conversations")
        .select("*, contact:contacts(*), phone_number:whatsapp_phone_numbers(*)")
        .eq("id", conversationId)
        .single();
      if (!conv) return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      conversation = conv;
      contact = conv.contact;
    } else {
      const phoneNormalized = phone.replace(/[^0-9]/g, "");
      const { data: existingContact } = await supabase.from("contacts").select("*").eq("tenant_id", tenantId).eq("phone_normalized", phoneNormalized).maybeSingle();
      if (existingContact) {
        contact = existingContact;
      } else {
        const { data: newContact } = await supabase.from("contacts").insert({ tenant_id: tenantId, phone, phone_normalized: phoneNormalized, source: "api", project: project || null }).select().single();
        if (!newContact) throw new Error("Failed to create contact");
        contact = newContact;
      }

      const { data: existingConv } = await supabase
        .from("conversations")
        .select("*, contact:contacts(*), phone_number:whatsapp_phone_numbers(*)")
        .eq("tenant_id", tenantId).eq("contact_id", contact.id).eq("status", "open")
        .maybeSingle();

      if (existingConv) {
        conversation = existingConv;
      } else {
        const { data: newConv } = await supabase.from("conversations").insert({ tenant_id: tenantId, contact_id: contact.id, phone_number_id: null, status: "open", last_message_at: new Date().toISOString(), project: project || null }).select("*, contact:contacts(*), phone_number:whatsapp_phone_numbers(*)").single();
        if (!newConv) throw new Error("Failed to create conversation");
        conversation = newConv;
      }
    }

    const convId = conversation.id;
    const phoneNumberIdFromConv = conversation.phone_number?.phone_number_id;
    const account = await resolveAccount(supabase, conversationId, project, phoneNumberIdFromConv);

    if (!account) {
      return new Response(JSON.stringify({ error: "No active WhatsApp account found" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const phoneNumberId = account.phone_number_id;
    const accessToken = account.access_token;
    const recipientPhone = contact?.phone_normalized;

    const { data: templateRecord } = await supabase
      .from("whatsapp_templates")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("name", templateName)
      .maybeSingle();

    if (!templateRecord) {
      return new Response(JSON.stringify({ error: `Template "${templateName}" not found in local DB` }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const storedComponents = (templateRecord.components) || [];
    const metaComponents = [];
    let paramIndex = 0;

    for (const comp of storedComponents) {
      if (comp.type === "HEADER") {
        const headerComponent = { type: "HEADER" };
        if (comp.format === "TEXT") {
          headerComponent.parameters = [{ type: "text", text: comp.text || "" }];
        } else if (comp.format === "IMAGE") {
          headerComponent.parameters = [{ type: "image", image: { link: headerMediaUrl || comp.example?.header_handle?.[0] || "" } }];
        } else if (comp.format === "VIDEO") {
          headerComponent.parameters = [{ type: "video", video: { link: headerMediaUrl || comp.example?.header_handle?.[0] || "" } }];
        } else if (comp.format === "DOCUMENT") {
          headerComponent.parameters = [{ type: "document", document: { link: headerMediaUrl || comp.example?.header_handle?.[0] || "", filename: "document" } }];
        }
        if (headerComponent.parameters?.[0]?.link || headerComponent.parameters?.[0]?.text) {
          metaComponents.push(headerComponent);
        }
      } else if (comp.type === "BODY") {
        const bodyParams = [];
        if (params && params.length > 0 && paramIndex < params.length) {
          const paramCount = (comp.text?.match(/\{\{/g) || []).length || params.length;
          for (let i = paramIndex; i < paramIndex + paramCount; i++) {
            if (i < params.length) bodyParams.push({ type: "text", text: String(params[i]) });
          }
          paramIndex += bodyParams.length;
        }
        metaComponents.push({ type: "BODY", parameters: bodyParams });
      } else if (comp.type === "BUTTONS") {
        const buttonParams = (comp.buttons || []).map((btn) => {
          if (btn.type === "URL") return { type: "url", text: btn.text, url: btn.url || "https://example.com" };
          if (btn.type === "PHONE_NUMBER") return { type: "phone_number", text: btn.text };
          return { type: "quick_reply", text: btn.text };
        });
        metaComponents.push({ type: "BUTTONS", parameters: buttonParams });
      }
    }

    const metaPayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientPhone,
      type: "template",
      template: {
        name: templateName,
        language: { code: templateRecord.language || language || "en" },
        components: metaComponents,
      },
    };

    const { data: message, error: msgError } = await supabase
      .from("messages")
      .insert({
        tenant_id: tenantId,
        conversation_id: convId,
        contact_id: conversation.contact_id,
        direction: "outbound",
        message_type: "template",
        body_text: `Template: ${templateName}`,
        template_id: templateRecord.meta_template_id,
        template_params: { name: templateName, language: templateRecord.language, params },
        status: "queued",
        message_category: templateRecord.category || "utility",
      })
      .select()
      .single();

    if (msgError) throw msgError;

    try {
      const resp = await fetch(`${WHATSAPP_API}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(metaPayload),
      });
      const result = await resp.json();

      if (resp.ok && result.messages?.[0]?.id) {
        await supabase.from("messages").update({ wa_message_id: result.messages[0].id, status: "sent", status_updated_at: new Date().toISOString() }).eq("id", message.id);
      } else {
        const errMsg = result.error?.message || "Meta API error";
        await supabase.from("messages").update({ status: "failed", failure_reason: errMsg, status_updated_at: new Date().toISOString() }).eq("id", message.id);
        return new Response(JSON.stringify({ error: errMsg }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } catch (apiError) {
      await supabase.from("messages").update({ status: "failed", failure_reason: apiError.message || "Network error", status_updated_at: new Date().toISOString() }).eq("id", message.id);
      throw apiError;
    }

    await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", convId);

    return new Response(JSON.stringify({ success: true, message, conversationId: convId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Send template error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
