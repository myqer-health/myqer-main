// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  try{
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const lang = (searchParams.get("lang") || "en").slice(0,2);
    if(!code) return new Response(JSON.stringify({ error:"Missing code" }), { status:400 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, country, date_of_birth, national_id, triage_override, triage_auto, code")
      .eq("code", code)
      .single();

    if(!profile) return new Response(JSON.stringify({ error:"Not found" }), { status:404 });

    const { data: health } = await supabase
      .from("health_profiles")
      .select("blood_type, organ_donor, life_support_pref, allergies, conditions, meds")
      .eq("user_id", profile.id)
      .single();

    const { data: contacts } = await supabase
      .from("ice_contacts")
      .select("name, relation, phone")
      .eq("user_id", profile.id);

    const json = {
      profile: {
        full_name: profile.full_name,
        country: profile.country,
        dob: profile.date_of_birth,
        national_id: profile.national_id,
        triage: profile.triage_override || profile.triage_auto || "green",
      },
      sections: {
        blood: { value: health?.blood_type || null, donor: !!health?.organ_donor },
        prefs: { life_support_pref: health?.life_support_pref || null },
        allergies: { items: (health?.allergies || "").split(",").map(s=>s.trim()).filter(Boolean) },
        conditions: { items: (health?.conditions || "").split(",").map(s=>s.trim()).filter(Boolean) },
        meds: { items: (health?.meds || "").split(",").map(s=>s.trim()).filter(Boolean) },
        ice: { contacts: contacts || [] }
      },
      labels: getLabels(lang),
      voice: {}
    };

    return new Response(JSON.stringify(json), {
      headers: {
        "Content-Type":"application/json",
        "Access-Control-Allow-Origin":"*",
        "Access-Control-Allow-Methods":"GET, OPTIONS",
        "Access-Control-Allow-Headers":"Content-Type"
      }
    });
  }catch(e){
    return new Response(JSON.stringify({ error:String(e) }), { status:500 });
  }
});

function getLabels(lang:string){
  const labels:any = {
    en:{ Triage:"Triage", Name:"Name", BloodType:"Blood Type" },
    es:{ Triage:"Triaje", Name:"Nombre", BloodType:"Tipo de Sangre" },
    de:{ Triage:"Triage", Name:"Name", BloodType:"Blutgruppe" },
    fr:{ Triage:"Triage", Name:"Nom", BloodType:"Groupe Sanguin" },
  };
  return labels[lang] || labels.en;
}
