import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Validate user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) throw new Error("Unauthorized");

    const { campaignId } = await req.json();
    if (!campaignId) throw new Error("campaignId is required");

    const admin = createClient(supabaseUrl, serviceKey);

    // 1. Fetch source campaign
    const { data: src, error: srcErr } = await admin
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();
    if (srcErr || !src) throw new Error("Campaign not found");

    // 2. Determine clone name with sequence
    const baseName = src.name.replace(/\s*-\s*Clone\s*\d+$/i, "");
    const { data: existing } = await admin
      .from("campaigns")
      .select("name")
      .like("name", `${baseName} - Clone%`);
    const usedNumbers = (existing || []).map((c: any) => {
      const match = c.name.match(/Clone\s*(\d+)$/i);
      return match ? parseInt(match[1]) : 0;
    });
    const nextNum = usedNumbers.length > 0 ? Math.max(...usedNumbers) + 1 : 1;
    const cloneName = `${baseName} - Clone ${nextNum}`;

    // 3. Insert new campaign (strip id, code_auto, timestamps)
    const { id: _id, code_auto: _code, created_at: _ca, updated_at: _ua, ...campaignData } = src;
    const { data: newCampaign, error: insertErr } = await admin
      .from("campaigns")
      .insert({ ...campaignData, name: cloneName, created_by: user.id, active: false })
      .select()
      .single();
    if (insertErr) throw insertErr;
    const newId = newCampaign.id;

    // 4. Clone all sub-tables
    const subTables = [
      { table: "campaign_products", idCol: "campaign_id", strip: ["id", "created_at"] },
      { table: "campaign_segments", idCol: "campaign_id", strip: ["id"] },
      { table: "campaign_channel_types", idCol: "campaign_id", strip: ["id"] },
      { table: "campaign_channel_segments", idCol: "campaign_id", strip: ["id"] },
      { table: "channel_margins", idCol: "campaign_id", strip: ["id"] },
      { table: "campaign_payment_methods", idCol: "campaign_id", strip: ["id"] },
      { table: "campaign_clients", idCol: "campaign_id", strip: ["id"] },
      { table: "campaign_buyers", idCol: "campaign_id", strip: ["id"] },
      { table: "campaign_distributors", idCol: "campaign_id", strip: ["id"] },
      { table: "campaign_due_dates", idCol: "campaign_id", strip: ["id"] },
      { table: "campaign_delivery_locations", idCol: "campaign_id", strip: ["id"] },
      { table: "campaign_indicative_prices", idCol: "campaign_id", strip: ["id"] },
      { table: "campaign_commodity_valorizations", idCol: "campaign_id", strip: ["id"] },
      { table: "commodity_pricing", idCol: "campaign_id", strip: ["id", "updated_at"] },
      { table: "freight_reducers", idCol: "campaign_id", strip: ["id"] },
      { table: "ports", idCol: "campaign_id", strip: ["id"], filter: { is_global: false } },
    ];

    for (const sub of subTables) {
      let query = admin.from(sub.table).select("*").eq(sub.idCol, campaignId);
      if (sub.filter) {
        for (const [k, v] of Object.entries(sub.filter)) {
          query = query.eq(k, v);
        }
      }
      const { data: rows } = await query;
      if (rows && rows.length > 0) {
        const clonedRows = rows.map((row: any) => {
          const clone = { ...row, [sub.idCol]: newId };
          for (const s of sub.strip) delete clone[s];
          return clone;
        });
        await admin.from(sub.table).insert(clonedRows);
      }
    }

    // 5. Clone combos + combo_products (need id mapping)
    const { data: srcCombos } = await admin.from("combos").select("*").eq("campaign_id", campaignId);
    if (srcCombos && srcCombos.length > 0) {
      for (const combo of srcCombos) {
        const { id: oldComboId, created_at: _cca, ...comboData } = combo;
        const { data: newCombo } = await admin
          .from("combos")
          .insert({ ...comboData, campaign_id: newId })
          .select()
          .single();
        if (newCombo) {
          const { data: comboProducts } = await admin
            .from("combo_products")
            .select("*")
            .eq("combo_id", oldComboId);
          if (comboProducts && comboProducts.length > 0) {
            const clonedCPs = comboProducts.map((cp: any) => {
              const { id: _cpId, ...cpData } = cp;
              return { ...cpData, combo_id: newCombo.id };
            });
            await admin.from("combo_products").insert(clonedCPs);
          }
        }
      }
    }

    return new Response(JSON.stringify({ id: newId, name: cloneName }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
