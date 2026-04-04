// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const SAMPLE_RECIPES = [
  {
    id:1, title:"Veggie Omelette", category:"breakfast", image:null,
    tags:["PCOS-Friendly","Gluten-Free","Low Carb","Blood Sugar Stable"], allergens:["eggs","dairy"],
    equipment:["stove"], type:{protein:true,grain:false,side:false},
    nutrition:{calories:280,protein:18,carbs:6,fat:20}, goal:["lose weight"],
    ingredients:[{name:"Eggs",amount:3,unit:"pcs"},{name:"Spinach",amount:1,unit:"cup"},{name:"Cherry Tomatoes",amount:0.5,unit:"cup"},{name:"Olive Oil",amount:1,unit:"tbsp"},{name:"Feta Cheese",amount:2,unit:"tbsp"}],
    steps:[{text:"Halve tomatoes and wash spinach.",timeMin:3,imagePrompt:"overhead studio shot of halved cherry tomatoes and fresh spinach on wood cutting board, white marble, soft studio lighting"},{text:"Crack 3 eggs into bowl, whisk until uniform.",timeMin:2,imagePrompt:"overhead studio shot of three cracked eggs being whisked in white ceramic bowl, white marble, soft studio lighting"},{text:"Heat oil in pan until shimmering.",timeMin:2,imagePrompt:"overhead studio shot of olive oil shimmering in dark non-stick skillet, white marble, soft studio lighting"},{text:"Pour eggs, add veg, cook 3 min then fold.",timeMin:4,imagePrompt:"overhead studio shot of golden omelette folding in non-stick pan with spinach and tomatoes, white marble, soft studio lighting"}],
    sourceUrl:"", prepTime:5, cookTime:6, totalTime:11, servings:1, difficulty:"beginner",
    healthBenefits:"Protein-rich and blood-sugar friendly.", bloodSugarFriendly:true
  },
  {
    id:2, title:"Grilled Chicken Quinoa Bowl", category:"lunch", image:null,
    tags:["High Protein","Dairy-Free","PCOS-Friendly","Anti-Inflammatory"], allergens:[],
    equipment:["oven","stove"], type:{protein:true,grain:true,side:false},
    nutrition:{calories:420,protein:35,carbs:40,fat:15}, goal:["gain muscle","lose weight"],
    ingredients:[{name:"Chicken Breast",amount:1.5,unit:"lbs"},{name:"Quinoa",amount:2,unit:"cups"},{name:"Broccoli",amount:4,unit:"cups"},{name:"Olive Oil",amount:0.25,unit:"cup"},{name:"Garlic",amount:4,unit:"cloves"}],
    steps:[{text:"Season chicken with garlic, olive oil and herbs.",timeMin:5,imagePrompt:"overhead studio shot of raw chicken breasts being seasoned with garlic and herbs, white marble, soft studio lighting"},{text:"Rinse quinoa, simmer in 4 cups water 15 min.",timeMin:18,imagePrompt:"overhead studio shot of quinoa simmering in white ceramic pot, white marble, soft studio lighting"},{text:"Grill chicken 6-7 min per side until 165F.",timeMin:14,imagePrompt:"overhead studio shot of chicken with grill marks in cast iron pan, white marble, soft studio lighting"},{text:"Steam broccoli 4-5 min until bright green.",timeMin:5,imagePrompt:"overhead studio shot of bright green broccoli florets in steamer basket, white marble, soft studio lighting"}],
    sourceUrl:"", prepTime:10, cookTime:37, totalTime:47, servings:4, difficulty:"intermediate",
    healthBenefits:"High protein and anti-inflammatory omega-3s.", antiInflammatory:true
  },
  {
    id:3, title:"Matcha Oat Latte", category:"drink", image:null,
    tags:["Dairy-Free","PCOS-Friendly","Low Calorie"], allergens:[],
    equipment:["none"], type:{protein:false,grain:false,side:false},
    nutrition:{calories:90,protein:2,carbs:14,fat:3}, goal:["lose weight","maintenance"],
    ingredients:[{name:"Matcha Powder",amount:1,unit:"tsp"},{name:"Oat Milk",amount:1,unit:"cup"},{name:"Honey",amount:1,unit:"tsp"},{name:"Hot Water",amount:0.25,unit:"cup"}],
    steps:[{text:"Sift matcha into ceramic bowl.",timeMin:1,imagePrompt:"overhead studio shot of bright green matcha being sifted into white ceramic bowl, white marble, soft studio lighting"},{text:"Add 175F water, whisk in W motion until frothy.",timeMin:2,imagePrompt:"overhead studio shot of matcha being whisked with bamboo whisk in white bowl, white marble, soft studio lighting"},{text:"Warm oat milk, froth, pour over matcha.",timeMin:3,imagePrompt:"overhead studio shot of frothed oat milk being poured over matcha in clear glass, white marble, soft studio lighting"}],
    sourceUrl:"", prepTime:2, cookTime:4, totalTime:6, servings:1, difficulty:"beginner", healthBenefits:""
  },
  {
    id:4, title:"Dark Chocolate Coconut Mousse", category:"dessert", image:null,
    tags:["Dairy-Free","Gluten-Free","Vegan"], allergens:[],
    equipment:["none"], type:{protein:false,grain:false,side:true},
    nutrition:{calories:210,protein:4,carbs:28,fat:12}, goal:["maintenance"],
    ingredients:[{name:"Dark Chocolate 70%",amount:200,unit:"g"},{name:"Coconut Cream",amount:1,unit:"cup"},{name:"Maple Syrup",amount:3,unit:"tbsp"},{name:"Vanilla Extract",amount:1,unit:"tsp"}],
    steps:[{text:"Melt chocolate over double boiler.",timeMin:6,imagePrompt:"overhead studio shot of dark chocolate melting in glass bowl over saucepan, white marble, soft studio lighting"},{text:"Whip chilled coconut cream to stiff peaks.",timeMin:4,imagePrompt:"overhead studio shot of white coconut cream being whipped in white bowl, white marble, soft studio lighting"},{text:"Fold chocolate into cream, chill 2 hrs.",timeMin:5,imagePrompt:"overhead studio shot of chocolate being folded into coconut cream with spatula, white marble, soft studio lighting"}],
    sourceUrl:"", prepTime:15, cookTime:11, totalTime:26, servings:4, difficulty:"intermediate", healthBenefits:""
  },
  {
    id:5, title:"Turmeric Ginger Salmon Bowl", category:"lunch", image:null,
    tags:["Anti-Inflammatory","Omega-3 Rich","Gluten-Free","Dairy-Free","High Protein","Blood Sugar Stable"], allergens:["shellfish"],
    equipment:["stove","oven"], type:{protein:true,grain:true,side:false},
    nutrition:{calories:480,protein:42,carbs:38,fat:18}, goal:["lose weight","maintenance"],
    ingredients:[{name:"Salmon Fillet",amount:2,unit:"pcs"},{name:"Brown Rice",amount:1,unit:"cup"},{name:"Turmeric",amount:1,unit:"tsp"},{name:"Fresh Ginger",amount:1,unit:"tbsp"},{name:"Spinach",amount:2,unit:"cups"},{name:"Olive Oil",amount:2,unit:"tbsp"}],
    steps:[{text:"Cook brown rice with pinch of turmeric 35 min.",timeMin:35,imagePrompt:"overhead studio shot of brown rice simmering with golden turmeric in white pot, white marble, soft studio lighting"},{text:"Rub salmon with turmeric, ginger and olive oil.",timeMin:5,imagePrompt:"overhead studio shot of salmon being rubbed with golden turmeric on white marble, soft studio lighting"},{text:"Sear salmon 4 min per side until golden.",timeMin:8,imagePrompt:"overhead studio shot of golden seared salmon in cast iron pan, white marble, soft studio lighting"},{text:"Wilt spinach in same pan with garlic 2 min.",timeMin:3,imagePrompt:"overhead studio shot of bright green spinach wilting in cast iron pan, white marble, soft studio lighting"}],
    sourceUrl:"", prepTime:10, cookTime:46, totalTime:56, servings:2, difficulty:"intermediate",
    healthBenefits:"Rich in omega-3s and curcumin — potent anti-inflammatory compounds.", antiInflammatory:true, bloodSugarFriendly:true
  },
  {
    id:6, title:"Blood Sugar Balance Bowl", category:"breakfast", image:null,
    tags:["Blood Sugar Stable","Anti-Inflammatory","Vegan","Gluten-Free","High Fiber","PCOS-Friendly"], allergens:["nuts"],
    equipment:["none"], type:{protein:false,grain:true,side:false},
    nutrition:{calories:340,protein:12,carbs:48,fat:14}, goal:["lose weight","maintenance"],
    ingredients:[{name:"Steel-Cut Oats",amount:0.5,unit:"cup"},{name:"Chia Seeds",amount:2,unit:"tbsp"},{name:"Blueberries",amount:0.5,unit:"cup"},{name:"Cinnamon",amount:0.5,unit:"tsp"},{name:"Almond Butter",amount:1,unit:"tbsp"},{name:"Almond Milk",amount:1,unit:"cup"}],
    steps:[{text:"Mix oats, chia, almond milk and cinnamon.",timeMin:3,imagePrompt:"overhead studio shot of oats, chia seeds and cinnamon in white bowl with almond milk, white marble, soft studio lighting"},{text:"Refrigerate overnight or simmer 20 min.",timeMin:1,imagePrompt:"overhead studio shot of covered white bowl with overnight oats, white marble, soft studio lighting"},{text:"Top with blueberries and almond butter drizzle.",timeMin:2,imagePrompt:"overhead studio shot of oat bowl topped with blueberries and almond butter, white marble, soft studio lighting"}],
    sourceUrl:"", prepTime:5, cookTime:1, totalTime:6, servings:1, difficulty:"beginner",
    healthBenefits:"Steel-cut oats and chia create a slow-digesting blood-sugar-stabilising breakfast.", antiInflammatory:true, bloodSugarFriendly:true
  }
];

const CATEGORIES = [
  {id:"all",label:"All Recipes",icon:"\u{1F37D}\uFE0F"},
  {id:"breakfast",label:"Breakfast",icon:"\u{1F305}"},
  {id:"lunch",label:"Lunch",icon:"\u{1F957}"},
  {id:"dessert",label:"Desserts",icon:"\u{1F36B}"},
  {id:"drink",label:"Drinks",icon:"\u{1F375}"},
];
const DIET_TAGS = ["PCOS-Friendly","High Protein","Gluten-Free","Dairy-Free","Vegan","Low Carb","High Fiber","Low Calorie"];
const HEALTH_TAGS = ["Anti-Inflammatory","Blood Sugar Stable","Omega-3 Rich","Antioxidant","Gut Health","Heart Healthy"];
const ALL_TAGS = [...DIET_TAGS,...HEALTH_TAGS];
const EQUIPMENT_LIST = ["stove","oven","air fryer","rice cooker","blender","none"];
const ALLERGENS_LIST = ["gluten","dairy","eggs","nuts","soy","shellfish"];
const GOALS = ["lose weight","gain muscle","maintenance"];
const DIFFICULTIES = {beginner:{label:"Beginner",color:"#5aad8e",icon:"\u{1F331}"},intermediate:{label:"Intermediate",color:"#d4875a",icon:"\u{1F373}"},advanced:{label:"Advanced",color:"#c06090",icon:"\u{1F468}\u200D\u{1F373}"}};
const TAG_COLORS = {"PCOS-Friendly":"#c06090","High Protein":"#3a7d5e","Dairy-Free":"#d4875a","Gluten-Free":"#5a8fd4","Vegan":"#6db85a","Low Carb":"#b8a23e","High Fiber":"#7b6cd4","Low Calorie":"#3eabb8"};
const HEALTH_COLORS = {"Anti-Inflammatory":"#e07a40","Blood Sugar Stable":"#5aad8e","Omega-3 Rich":"#5a8fd4","Antioxidant":"#9b5aad","Gut Health":"#ad8e5a","Heart Healthy":"#e05a6a"};
const ALL_TAG_COLORS = {...TAG_COLORS,...HEALTH_COLORS};
const STEP_COLORS = ["#3a7d5e","#5a8fd4","#d4875a","#c06090","#6db85a","#b8a23e","#7b6cd4","#3eabb8"];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const scaleAmt = (n, r) => {
  const v = Math.round(n * r * 10) / 10;
  return v % 1 === 0 ? v : v.toFixed(1);
};

// ─── SVG IMAGE GENERATION ────────────────────────────────────────────────────
function makeFoodSVG(title, category) {
  const t = (title||"").toLowerCase();
  const isSalmon = /salmon|fish|tuna/.test(t);
  const isOats = /oat|porridge|overnight/.test(t);
  const isMatcha = /matcha|latte|green tea/.test(t);
  const isDessert = category==="dessert" || /chocolate|mousse|cake/.test(t);
  const isEgg = /egg|omelette/.test(t);
  const enc = s => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
  const bg = "<defs><radialGradient id=\"bg\"><stop offset=\"0%\" stop-color=\"#f5f0ea\"/><stop offset=\"100%\" stop-color=\"#ede7dd\"/></radialGradient><radialGradient id=\"plate\"><stop offset=\"0%\" stop-color=\"#fff\"/><stop offset=\"100%\" stop-color=\"#e8e2d8\"/></radialGradient><filter id=\"sh\"><feDropShadow dx=\"0\" dy=\"6\" stdDeviation=\"10\" flood-color=\"rgba(0,0,0,0.2)\"/></filter></defs><rect width=\"800\" height=\"520\" fill=\"url(#bg)\"/>";
  if (isOats) return enc(`<svg viewBox="0 0 800 520" xmlns="http://www.w3.org/2000/svg">${bg}<ellipse cx="400" cy="275" rx="200" ry="185" fill="url(#plate)" filter="url(#sh)"/><ellipse cx="400" cy="278" rx="170" ry="155" fill="#f8eed8"/><circle cx="340" cy="215" r="18" fill="#4040c0" opacity="0.85"/><circle cx="365" cy="205" r="14" fill="#5050d0" opacity="0.8"/><circle cx="380" cy="220" r="16" fill="#3030b0" opacity="0.85"/><circle cx="420" cy="210" r="15" fill="#4040c0" opacity="0.8"/><path d="M360,270 Q400,258 440,272" stroke="#c08020" stroke-width="5" fill="none" opacity="0.75" stroke-linecap="round"/><ellipse cx="460" cy="245" rx="18" ry="9" fill="#2d8a30" opacity="0.85" transform="rotate(-30,460,245)"/></svg>`);
  if (isMatcha) return enc(`<svg viewBox="0 0 800 520" xmlns="http://www.w3.org/2000/svg">${bg}<ellipse cx="350" cy="270" rx="125" ry="120" fill="#1a5c10" filter="url(#sh)"/><ellipse cx="350" cy="268" rx="115" ry="110" fill="#4a9828" opacity="0.9"/><ellipse cx="350" cy="264" rx="95" ry="90" fill="#fff" opacity="0.65"/><ellipse cx="570" cy="220" rx="72" ry="65" fill="#e8e4dc" filter="url(#sh)"/><ellipse cx="570" cy="218" rx="58" ry="52" fill="#a8c840" opacity="0.85"/></svg>`);
  if (isDessert) return enc(`<svg viewBox="0 0 800 520" xmlns="http://www.w3.org/2000/svg">${bg}<ellipse cx="400" cy="278" rx="195" ry="180" fill="url(#plate)" filter="url(#sh)"/><ellipse cx="400" cy="278" rx="165" ry="150" fill="#2a1408"/><path d="M300,250 Q340,235 380,255 T440,248" stroke="#5a3018" stroke-width="3" fill="none" opacity="0.5"/><ellipse cx="400" cy="220" rx="52" ry="38" fill="#fffef8" opacity="0.92"/><circle cx="470" cy="218" r="14" fill="#cc2040" opacity="0.9"/><circle cx="490" cy="232" r="12" fill="#cc2040" opacity="0.85"/></svg>`);
  if (isEgg) return enc(`<svg viewBox="0 0 800 520" xmlns="http://www.w3.org/2000/svg">${bg}<ellipse cx="400" cy="275" rx="215" ry="195" fill="url(#plate)" filter="url(#sh)"/><ellipse cx="395" cy="278" rx="172" ry="132" fill="#f5d050" transform="rotate(-8,395,278)"/><ellipse cx="340" cy="270" rx="22" ry="11" fill="#2a7020" opacity="0.8" transform="rotate(-20,340,270)"/><circle cx="430" cy="265" r="12" fill="#d83030" opacity="0.82"/></svg>`);
  if (isSalmon) return enc(`<svg viewBox="0 0 800 520" xmlns="http://www.w3.org/2000/svg">${bg}<ellipse cx="400" cy="275" rx="225" ry="205" fill="url(#plate)" filter="url(#sh)"/><ellipse cx="390" cy="295" rx="168" ry="142" fill="#f8f0d8"/><ellipse cx="430" cy="255" rx="112" ry="70" fill="#e8622a" filter="url(#sh)" transform="rotate(-12,430,255)"/><ellipse cx="425" cy="290" rx="105" ry="16" fill="#c84820" opacity="0.6" transform="rotate(-12,425,290)"/><path d="M575,158 Q618,130 638,168 Q618,206 575,196 Z" fill="#f0e040"/></svg>`);
  return enc(`<svg viewBox="0 0 800 520" xmlns="http://www.w3.org/2000/svg">${bg}<ellipse cx="400" cy="275" rx="210" ry="195" fill="url(#plate)" filter="url(#sh)"/><ellipse cx="400" cy="278" rx="175" ry="160" fill="#f5eac8"/><ellipse cx="445" cy="248" rx="98" ry="70" fill="#c87830" filter="url(#sh)" transform="rotate(-12,445,248)"/><circle cx="295" cy="225" r="27" fill="#2a7020"/><circle cx="295" cy="225" r="20" fill="#3a8a2a"/></svg>`);
}

async function aiGenerateHeroSVG(title, category, ingredients) {
  const key = typeof localStorage !== 'undefined' && localStorage.getItem('anthropic_key');
  if (!key) return null;
  const ingredientList = (ingredients||[]).map(i=>i.name).slice(0,6).join(", ");
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST", headers:{"Content-Type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
      body:JSON.stringify({
        model:"claude-sonnet-4-6", max_tokens:5000,
        system:"You are a food SVG illustrator. Create a clean overhead studio shot SVG (viewBox=\"0 0 800 520\"). Style: direct overhead angle, soft studio lighting, marble or wood kitchen counter surface. Show ingredients realistically cut, chopped, or arranged in a white ceramic bowl or on a plate. Use radialGradient fills, feDropShadow filters, realistic vibrant food colors. NO text. Return ONLY the SVG starting with <svg.",
        messages:[{role:"user",content:`Overhead studio food illustration for: ${title}. Show these ingredients cut and arranged naturally: ${ingredientList}`}]
      })
    });
    if (!res.ok) return null;
    const d = await res.json();
    const text = (d.content||[]).map(c=>c.text||"").join("").trim();
    const m = text.match(/<svg[\s\S]*<\/svg>/i);
    if (m) return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(m[0]);
  } catch(e) {}
  return null;
}

async function fetchPageContent(url) {
  try {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, {signal:AbortSignal.timeout(9000)});
    if (!res.ok) return null;
    const d = await res.json();
    const html = d.contents || '';
    const ogImg = (html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i) || html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/i) || [])[1] || null;
    const text = html.replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,10000);
    return {text, ogImg};
  } catch(e) { return null; }
}

async function fetchPexelsImage(title) {
  const key = typeof localStorage !== 'undefined' && localStorage.getItem('pexels_key');
  if (!key) return null;
  const q = encodeURIComponent((title||'') + ' food meal');
  try {
    const res = await fetch(`https://api.pexels.com/v1/search?query=${q}&per_page=1&orientation=landscape`, {
      headers: { Authorization: key }
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d.photos?.[0]?.src?.medium || null;
  } catch(e) { return null; }
}

// ─── AI EXTRACTION ────────────────────────────────────────────────────────────
async function aiExtractRecipe(input) {
  const key = typeof localStorage !== 'undefined' && localStorage.getItem('anthropic_key');
  if (!key) throw new Error("NO_KEY");
  const isUrl = input.trim().startsWith("http");
  const src = isUrl ? (input.includes("tiktok")?"TikTok video":input.includes("instagram")?"Instagram reel":input.includes("youtu")?"YouTube video":"recipe webpage") : "text description";
  const tagList = ALL_TAGS.join(", ");

  let pageText = null, pageImage = null;
  if (isUrl) {
    const page = await fetchPageContent(input.trim());
    if (page) { pageText = page.text; pageImage = page.ogImg; }
  }

  const prompt = `Extract a complete recipe from this ${src}.
${isUrl ? "SOURCE URL: " + input : "DESCRIPTION: " + input}
${pageText ? "\nPAGE CONTENT (use this to extract the real recipe):\n" + pageText : (isUrl ? "\nPage could not be fetched — infer recipe from the URL path using culinary knowledge. ALWAYS produce a full recipe." : "")}

Respond with ONLY a valid JSON object. No markdown.

{
  "title": "Recipe Name",
  "category": "breakfast",
  "tags": ["High Protein"],
  "allergens": [],
  "equipment": ["stove"],
  "type": {"protein": true, "grain": false, "side": false},
  "nutrition": {"calories": 420, "protein": 35, "carbs": 40, "fat": 12},
  "goal": ["gain muscle"],
  "prepTime": 10, "cookTime": 25, "totalTime": 35, "servings": 2,
  "description": "Two-sentence description.",
  "ingredients": [{"name": "Chicken Breast", "amount": 2, "unit": "pcs"}],
  "steps": [{"text": "Detailed step.", "timeMin": 5, "image": null, "imagePrompt": "overhead studio shot on white marble"}],
  "sourceUrl": "${isUrl ? input : ""}",
  "sourceType": "${src}",
  "difficulty": "beginner",
  "healthBenefits": "",
  "antiInflammatory": false,
  "bloodSugarFriendly": false
}

RULES:
- category: breakfast, lunch, dessert, or drink
- tags from: ${tagList}
- allergens from: ${ALLERGENS_LIST.join(", ")}
- equipment from: ${EQUIPMENT_LIST.join(", ")}
- goal from: ${GOALS.join(", ")}
- 4-8 ingredients, 3-7 steps, each step has realistic timeMin and imagePrompt
- difficulty: beginner, intermediate, or advanced`;

  let res, d, raw;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({
          model:"claude-sonnet-4-6", max_tokens:4000,
          system:"You are a culinary AI. Respond ONLY with a valid JSON object starting with { and ending with }. No markdown.",
          messages:[{role:"user",content:prompt}]
        })
      });
      if (!res.ok) { const errBody = await res.text().catch(()=>""); throw new Error("HTTP " + res.status + (errBody ? ": " + errBody.slice(0,120) : "")); }
      d = await res.json();
      raw = (d.content||[]).map(c=>c.text||"").join("").trim();
      break;
    } catch(err) { if (attempt===1) throw err; await new Promise(r=>setTimeout(r,1000)); }
  }
  const stripped = raw.replace(/^```(?:json)?\s*/im,"").replace(/\s*```\s*$/im,"").trim();
  const jStart = stripped.indexOf("{"), jEnd = stripped.lastIndexOf("}");
  if (jStart===-1||jEnd===-1) throw new Error("No JSON found");
  const recipe = JSON.parse(stripped.slice(jStart, jEnd+1));
  recipe.totalTime = recipe.totalTime || (recipe.prepTime||0) + (recipe.cookTime||0);
  if (recipe.antiInflammatory && !(recipe.tags||[]).includes("Anti-Inflammatory")) recipe.tags = [...(recipe.tags||[]), "Anti-Inflammatory"];
  if (recipe.bloodSugarFriendly && !(recipe.tags||[]).includes("Blood Sugar Stable")) recipe.tags = [...(recipe.tags||[]), "Blood Sugar Stable"];
  if (pageImage && !recipe.image) recipe.image = pageImage;
  return {...recipe, id:Date.now()};
}

// ─── PDF EXPORT ──────────────────────────────────────────────────────────────
function exportRecipeToPDF(recipe, scale) {
  const s = scale || recipe.servings || 1;
  const r = s / (recipe.servings||1);
  const win = window.open("","_blank");
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${recipe.title}</title>
  <style>body{font-family:'Segoe UI',sans-serif;max-width:720px;margin:0 auto;padding:32px;color:#1a1a1a}h1{font-family:Georgia,serif;font-size:28px;margin:0 0 6px}
  .meta{color:#666;font-size:13px;margin-bottom:16px}.tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
  .tag{background:#f0f0f0;border-radius:20px;padding:3px 10px;font-size:12px}.health{background:#e8f5e9;color:#2e7d32}
  .nutrition{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;background:#f9f9f9;border-radius:12px;padding:16px;margin:16px 0}
  .nbox{text-align:center}.nval{font-size:22px;font-weight:700}.nlbl{font-size:11px;color:#888;text-transform:uppercase}
  .stitle{font-size:18px;font-weight:700;border-bottom:2px solid #eee;padding-bottom:6px;margin:20px 0 10px;font-family:Georgia,serif}
  .ing{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:14px}
  .amt{font-weight:600;color:#2e7d32}.step{display:flex;gap:14px;margin-bottom:14px}
  .snum{min-width:28px;height:28px;border-radius:50%;background:#333;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;margin-top:2px}
  .stext{font-size:14px;flex:1}.stime{color:#888;font-size:12px;margin-top:2px}
  .hbnote{background:#e8f5e9;border-left:4px solid #4caf50;padding:12px 16px;border-radius:0 8px 8px 0;font-size:13px;color:#2e7d32;margin:12px 0}
  @media print{button{display:none}}</style></head><body>
  <h1>${recipe.title}</h1>
  <div class="meta">${recipe.category} · ${recipe.prepTime||0}min prep · ${recipe.cookTime||0}min cook · ${recipe.totalTime||0}min total · ${s} servings</div>
  ${recipe.healthBenefits ? `<div class="hbnote">${recipe.healthBenefits}</div>` : ""}
  <div class="tags">${(recipe.tags||[]).map(t=>`<span class="tag ${HEALTH_TAGS.includes(t)?"health":""}">${t}</span>`).join("")}${(recipe.allergens||[]).map(a=>`<span class="tag" style="background:#fff3e0;color:#e65100">! ${a}</span>`).join("")}</div>
  <div class="nutrition">
    ${[["Calories",Math.round(recipe.nutrition.calories*r),""],["Protein",Math.round(recipe.nutrition.protein*r),"g"],["Carbs",Math.round(recipe.nutrition.carbs*r),"g"],["Fat",Math.round(recipe.nutrition.fat*r),"g"]].map(([l,v,u])=>`<div class="nbox"><div class="nval">${v}${u}</div><div class="nlbl">${l}</div></div>`).join("")}
  </div>
  <div class="stitle">Ingredients <small style="font-weight:400;color:#888">(${s} servings)</small></div>
  ${(recipe.ingredients||[]).map(i=>`<div class="ing"><span>${i.name}</span><span class="amt">${scaleAmt(i.amount,r)} ${i.unit}</span></div>`).join("")}
  <div class="stitle">Steps</div>
  ${(recipe.steps||[]).map((s,i)=>`<div class="step"><div class="snum">${i+1}</div><div><div class="stext">${s.text}</div>${s.timeMin?`<div class="stime">${s.timeMin} min</div>`:""}</div></div>`).join("")}
  <div style="margin-top:28px;padding-top:14px;border-top:1px solid #eee;color:#aaa;font-size:11px;text-align:center">MealPrepMaster · ${new Date().toLocaleDateString()}</div>
  <div style="text-align:center;margin-top:16px"><button onclick="window.print()" style="background:#333;color:#fff;border:none;border-radius:8px;padding:10px 24px;font-size:14px;cursor:pointer">Print / Save PDF</button></div>
  </body></html>`);
  win.document.close();
}

function exportMealBookToPDF(recipes, title) {
  const win = window.open("","_blank");
  const pages = recipes.map((r,idx)=>`
    <div style="page-break-before:${idx>0?"always":"auto"};padding:24px">
      <h2 style="font-family:Georgia,serif;font-size:22px;margin:0 0 4px">${r.title}</h2>
      <div style="color:#666;font-size:12px;margin-bottom:10px">${r.category} · ${r.totalTime||0}min · ${r.servings} servings</div>
      ${(r.tags||[]).slice(0,4).map(t=>`<span style="background:#f0f0f0;border-radius:20px;padding:2px 8px;font-size:11px;margin-right:4px">${t}</span>`).join("")}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:14px 0">
        <div><b style="font-size:14px">Ingredients</b><br/><br/>${(r.ingredients||[]).map(i=>`<div style="font-size:12px;padding:3px 0;border-bottom:1px solid #f5f5f5;display:flex;justify-content:space-between"><span>${i.name}</span><span style="color:#2e7d32;font-weight:600">${i.amount} ${i.unit}</span></div>`).join("")}</div>
        <div><b style="font-size:14px">Steps</b><br/><br/>${(r.steps||[]).map((s,i)=>`<div style="font-size:12px;margin-bottom:5px"><b>${i+1}.</b> ${s.text}</div>`).join("")}</div>
      </div>
    </div>`).join("");
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title||"Meal Book"}</title>
  <style>body{font-family:'Segoe UI',sans-serif;max-width:800px;margin:0 auto;color:#1a1a1a}@media print{button{display:none}}</style>
  </head><body>
  <div style="text-align:center;padding:48px 0;border-bottom:3px solid #333;margin-bottom:32px">
    <div style="font-size:40px;margin-bottom:8px">🥗</div>
    <h1 style="font-family:Georgia,serif;font-size:34px;margin:0 0 6px">${title||"My Meal Book"}</h1>
    <div style="color:#666;font-size:14px">${recipes.length} recipes · ${new Date().toLocaleDateString()}</div>
  </div>
  ${pages}
  <div style="text-align:center;margin:32px 0"><button onclick="window.print()" style="background:#333;color:#fff;border:none;border-radius:8px;padding:12px 28px;font-size:15px;cursor:pointer">Print / Save PDF</button></div>
  </body></html>`);
  win.document.close();
}

// ─── STYLE CONSTANTS ─────────────────────────────────────────────────────────
const IS = {background:"var(--nm-input-bg)",boxShadow:"var(--nm-inset)",border:"none",borderRadius:10,color:"var(--text)",padding:"10px 14px",fontSize:14,outline:"none",width:"100%",boxSizing:"border-box",fontFamily:"inherit"};
const GB = {background:"var(--bg-card)",boxShadow:"var(--nm-raised-sm)",border:"none",borderRadius:10,color:"var(--text)",padding:"8px 16px",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"inherit",transition:"box-shadow .15s"};
const CB = {boxShadow:"var(--nm-raised-sm)",border:"none",borderRadius:20,padding:"5px 13px",cursor:"pointer",fontSize:12,fontFamily:"inherit",background:"var(--bg-card)",color:"var(--text-sub)"};

// ─── SMALL COMPONENTS ────────────────────────────────────────────────────────
const TagChip = ({label,color="#3a7d5e"}) => (
  <span style={{background:color+"2a",color,border:"1px solid "+color+"55",borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{label}</span>
);

const NutriBadge = ({n}) => (
  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
    {[["🔥",n.calories,"kcal"],["💪",n.protein,"g P"],["🌾",n.carbs,"g C"],["🥑",n.fat,"g F"]].map(([ico,v,l]) => (
      <span key={l} style={{background:"var(--nm-input-bg)",boxShadow:"var(--nm-inset)",borderRadius:20,padding:"2px 8px",color:"var(--text-sub)",fontSize:11}}>{ico} {v}{l}</span>
    ))}
  </div>
);

// ─── SMART IMAGE ─────────────────────────────────────────────────────────────
function SmartImage({recipe, style, regen=0}) {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (recipe.image && regen === 0) { setSrc(recipe.image); setLoading(false); return; }
    setSrc(makeFoodSVG(recipe.title, recipe.category));
    setLoading(true);
    fetchPexelsImage(recipe.title).then(pexelsUrl => {
      if (cancelled) return;
      if (pexelsUrl) { setSrc(pexelsUrl); setLoading(false); return; }
      aiGenerateHeroSVG(recipe.title, recipe.category, recipe.ingredients).then(aiUrl => {
        if (!cancelled && aiUrl) setSrc(aiUrl);
        if (!cancelled) setLoading(false);
      });
    });
    return () => { cancelled = true; };
  }, [recipe.id, regen]);

  return (
    <div style={{position:"relative",...style}}>
      {src && <img src={src} alt={recipe.title} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.src=makeFoodSVG(recipe.title,recipe.category);}}/>}
      {loading && <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.3)",fontSize:11,color:"rgba(255,255,255,0.6)"}}>Generating...</div>}
    </div>
  );
}

// ─── RECIPE CARD ─────────────────────────────────────────────────────────────
function RecipeCard({recipe, onClick, onFavorite, isFavorite}) {
  const total = recipe.totalTime || (recipe.prepTime||0) + (recipe.cookTime||0);
  const isHealth = (recipe.tags||[]).some(t => HEALTH_TAGS.includes(t));
  return (
    <div style={{background:"var(--bg-card)",boxShadow:isHealth?"var(--nm-raised),0 0 0 2px var(--accent)30":"var(--nm-raised)",borderRadius:18,overflow:"hidden",transition:"all .2s",position:"relative",cursor:"pointer"}}
      onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-4px)";e.currentTarget.style.boxShadow="var(--nm-inset)";}}
      onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow=isHealth?"var(--nm-raised),0 0 0 2px var(--accent)30":"var(--nm-raised)";}}>
      <div onClick={()=>onClick(recipe)}>
        <div style={{position:"relative",height:180}}>
          <SmartImage recipe={recipe} style={{width:"100%",height:"100%"}}/>
          <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(13,15,23,.96) 0%,transparent 52%)"}}/>
          <span style={{position:"absolute",top:9,left:9,background:"rgba(13,15,23,.85)",color:"#ffd580",fontSize:10,padding:"3px 8px",borderRadius:8,fontWeight:700}}>
            {(CATEGORIES.find(c=>c.id===recipe.category)||{}).icon} {recipe.category}
          </span>
          {total > 0 && <span style={{position:"absolute",top:9,right:9,background:"rgba(13,15,23,.85)",color:"#5aad8e",fontSize:11,padding:"3px 9px",borderRadius:8,fontWeight:700}}>{total}min</span>}
          <div style={{position:"absolute",bottom:10,left:12,right:12}}>
            <div style={{color:"#fff",fontWeight:700,fontSize:14,fontFamily:"'Playfair Display',serif",lineHeight:1.3}}>{recipe.title}</div>
          </div>
          {recipe.sourceUrl && (
            <span style={{position:"absolute",bottom:10,right:10,background:"rgba(13,15,23,.85)",color:"#a0c0f0",fontSize:10,padding:"2px 7px",borderRadius:7,fontWeight:700}}>
              {/tiktok/.test(recipe.sourceUrl)?"📱 TikTok":/youtu/.test(recipe.sourceUrl)?"▶ YT":/instagram/.test(recipe.sourceUrl)?"📸 IG":"🌐 Web"}
            </span>
          )}
        </div>
        <div style={{padding:"10px 12px 12px"}}>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:7}}>
            {(recipe.tags||[]).slice(0,3).map(t=><TagChip key={t} label={t} color={ALL_TAG_COLORS[t]||"#888"}/>)}
          </div>
          <NutriBadge n={recipe.nutrition}/>
          <div style={{marginTop:7,display:"flex",gap:10,fontSize:11,color:"var(--text-muted)"}}>
            <span>{recipe.prepTime||0}m prep</span>
            <span>{recipe.cookTime||0}m cook</span>
            <span>{recipe.servings} servings</span>
          </div>
        </div>
      </div>
      {onFavorite && (
        <button onClick={e=>{e.stopPropagation();onFavorite(recipe);}}
          style={{position:"absolute",top:46,right:8,background:isFavorite?"rgba(192,80,80,0.85)":"rgba(0,0,0,0.6)",border:"none",borderRadius:"50%",width:30,height:30,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",zIndex:2}}>
          {isFavorite ? "♥" : "♡"}
        </button>
      )}
    </div>
  );
}

// ─── RECIPE DETAIL ────────────────────────────────────────────────────────────
function RecipeDetail({recipe:init, onClose, onFavorite, isFavorite, onRate, ratings}) {
  const [recipe, setRecipe] = useState(init);
  const [scale, setScale] = useState(init.servings||1);
  const [genIdx, setGenIdx] = useState(null);
  const [imgVer, setImgVer] = useState(0);
  const [timers, setTimers] = useState({});
  const timerRefs = useRef({});
  const [subFor, setSubFor] = useState(null);
  const [subs, setSubs] = useState({});
  const [subLoading, setSubLoading] = useState(null);
  const r = scale / (recipe.servings||1);
  const total = recipe.totalTime||(recipe.prepTime||0)+(recipe.cookTime||0);
  const diff = DIFFICULTIES[recipe.difficulty||"beginner"]||DIFFICULTIES.beginner;
  const myRating = ratings && ratings[recipe.id];

  const startTimer = i => {
    const step = recipe.steps[i];
    const secs = (step.timeMin||1)*60;
    setTimers(t=>({...t,[i]:{remaining:secs,running:true}}));
    timerRefs.current[i] = setInterval(()=>{
      setTimers(t=>{
        const rem = (t[i]&&t[i].remaining)||0;
        if (rem<=1) {
          clearInterval(timerRefs.current[i]);
          alert("Timer done for step "+(i+1)+": "+step.text.slice(0,40));
          return {...t,[i]:{remaining:0,running:false}};
        }
        return {...t,[i]:{remaining:rem-1,running:true}};
      });
    },1000);
  };

  const resetTimer = i => {
    clearInterval(timerRefs.current[i]);
    setTimers(t=>({...t,[i]:null}));
  };

  const fmtTime = secs => {
    const m = Math.floor(secs/60), s = secs%60;
    return String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
  };

  const fetchSubs = async ing => {
    const key = typeof localStorage !== 'undefined' && localStorage.getItem('anthropic_key');
    if (!key) return;
    setSubFor(ing.name); setSubLoading(ing.name);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:300,messages:[{role:"user",content:"Suggest 4 substitutes for "+ing.name+" in "+recipe.title+". Consider common dietary needs. Reply ONLY with a JSON array of strings."}]})});
      if (res.ok) {
        const d = await res.json();
        const text = (d.content||[]).map(c=>c.text||"").join("").trim();
        const m = text.match(/\[[\s\S]*\]/);
        if (m) { try { setSubs(s=>({...s,[ing.name]:JSON.parse(m[0])})); } catch(e){} }
      }
    } catch(e){}
    setSubLoading(null);
  };

  const getContainerSections = () => {
    const protein=[],grain=[],veggie=[];
    (recipe.ingredients||[]).forEach(ing=>{
      const n=(ing.name||"").toLowerCase();
      if (/chicken|beef|salmon|tuna|fish|shrimp|egg|turkey|pork|lamb|meat|protein|tofu/.test(n)) protein.push(ing);
      else if (/rice|oat|quinoa|pasta|flour|bread|noodle|cereal|tortilla|grain/.test(n)) grain.push(ing);
      else veggie.push(ing);
    });
    return {protein,grain,veggie};
  };

  const genStepImg = async i => {
    const key = typeof localStorage !== 'undefined' && localStorage.getItem('anthropic_key');
    if (!key) return;
    setGenIdx(i);
    try {
      const step = recipe.steps[i];
      const prompt = step.imagePrompt || step.text;
      const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:3000,system:"Create a clean overhead studio shot SVG (viewBox=\"0 0 800 400\"). Marble kitchen counter, studio lighting, show exactly how the ingredient should look at this step — cut, mixed, or cooking in a pan. Realistic food colors, no text. Return ONLY the SVG.",messages:[{role:"user",content:prompt}]})});
      if (res.ok) {
        const d = await res.json();
        const text = (d.content||[]).map(c=>c.text||"").join("").trim();
        const m = text.match(/<svg[\s\S]*<\/svg>/i);
        if (m) {
          const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(m[0]);
          setRecipe(prev=>{const s=[...prev.steps];s[i]={...s[i],image:url};return {...prev,steps:s};});
        }
      }
    } catch(e) {}
    setGenIdx(null);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}}>
      <div style={{background:"#0d0f17",border:"1px solid rgba(255,255,255,0.07)",borderRadius:24,maxWidth:760,width:"100%",maxHeight:"94vh",overflowY:"auto",boxShadow:"0 48px 120px rgba(0,0,0,0.9)"}}>

        {/* Hero */}
        <div style={{position:"relative",height:260}}>
          <SmartImage recipe={recipe} style={{width:"100%",height:"100%",borderRadius:"24px 24px 0 0"}} regen={imgVer}/>
          <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,#11141c 0%,transparent 55%)",borderRadius:"24px 24px 0 0"}}/>
          <div style={{position:"absolute",top:12,right:12,display:"flex",gap:7}}>
            {onFavorite && <button onClick={()=>onFavorite(recipe)} style={{background:isFavorite?"rgba(192,80,80,0.85)":"rgba(0,0,0,0.7)",border:"none",borderRadius:10,color:"#fff",cursor:"pointer",padding:"6px 12px",fontSize:13,fontFamily:"inherit"}}>{isFavorite?"♥ Saved":"♡ Save"}</button>}
            <button onClick={()=>setImgVer(v=>v+1)} title="Regenerate image" style={{background:"rgba(0,0,0,0.7)",border:"none",borderRadius:10,color:"#c8d0dc",cursor:"pointer",padding:"6px 10px",fontSize:14,fontFamily:"inherit"}}>🔄</button>
            <button onClick={()=>exportRecipeToPDF(recipe,scale)} style={{background:"rgba(0,0,0,0.7)",border:"none",borderRadius:10,color:"#c8d0dc",cursor:"pointer",padding:"6px 12px",fontSize:12,fontFamily:"inherit"}}>PDF</button>
            <button onClick={onClose} style={{background:"rgba(0,0,0,0.7)",border:"none",borderRadius:10,color:"#fff",cursor:"pointer",width:34,height:34,fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>
          <div style={{position:"absolute",bottom:18,left:20,right:60}}>
            <h2 style={{color:"#fff",fontFamily:"'Playfair Display',serif",fontSize:22,margin:"0 0 6px",lineHeight:1.2}}>{recipe.title}</h2>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{background:diff.color+"20",color:diff.color,border:"1px solid "+diff.color+"40",borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700}}>{diff.icon} {diff.label}</span>
              <span style={{color:"rgba(255,255,255,0.6)",fontSize:12}}>{total}min total · {recipe.servings} servings</span>
              {myRating && <span style={{color:"#ffd580",fontSize:11}}>⭐{myRating.taste||0} 💪{myRating.difficulty||0} 🕐{myRating.timeAccuracy||0} 🌶{myRating.spice||0}</span>}
            </div>
          </div>
        </div>

        <div style={{padding:"20px 24px 28px"}}>
          {/* Tags */}
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:14}}>
            {(recipe.tags||[]).map(t=><TagChip key={t} label={t} color={ALL_TAG_COLORS[t]||"#888"}/>)}
            {(recipe.allergens||[]).map(a=><TagChip key={a} label={"⚠ "+a} color="#c05050"/>)}
          </div>

          {recipe.healthBenefits && <div style={{background:"rgba(58,125,94,0.1)",border:"1px solid rgba(58,125,94,0.25)",borderRadius:10,padding:"10px 14px",marginBottom:14,color:"#5aad8e",fontSize:13}}>💚 {recipe.healthBenefits}</div>}

          {/* Nutrition + Scale */}
          <div style={{display:"flex",gap:12,marginBottom:18,flexWrap:"wrap",alignItems:"center"}}>
            <NutriBadge n={{calories:Math.round(recipe.nutrition.calories*r),protein:Math.round(recipe.nutrition.protein*r),carbs:Math.round(recipe.nutrition.carbs*r),fat:Math.round(recipe.nutrition.fat*r)}}/>
            <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:"auto"}}>
              <span style={{color:"#6a7a90",fontSize:12}}>Servings:</span>
              <button onClick={()=>setScale(s=>Math.max(1,s-1))} style={{...GB,padding:"3px 10px"}}>−</button>
              <span style={{color:"#fff",fontWeight:700,minWidth:20,textAlign:"center"}}>{scale}</span>
              <button onClick={()=>setScale(s=>s+1)} style={{...GB,padding:"3px 10px"}}>+</button>
            </div>
          </div>

          {/* Two columns */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:20}}>
            {/* Ingredients */}
            <div>
              <h3 style={{color:"#c8d0dc",fontSize:13,fontWeight:700,letterSpacing:.8,textTransform:"uppercase",marginBottom:10}}>Ingredients</h3>
              {(recipe.ingredients||[]).map((ing,i)=>(
                <div key={i}>
                  <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",fontSize:13,alignItems:"center"}}>
                    <span style={{color:"#c8d0dc"}}>{ing.name}</span>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <span style={{color:"#5aad8e",fontWeight:600}}>{scaleAmt(ing.amount,r)} {ing.unit}</span>
                      <button onClick={()=>subFor===ing.name?setSubFor(null):fetchSubs(ing)} style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:6,color:"#8a9bb0",padding:"1px 6px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}} title="Find substitutes">
                        {subLoading===ing.name?"...":"↔"}
                      </button>
                    </div>
                  </div>
                  {subFor===ing.name && subs[ing.name] && (
                    <div style={{background:"rgba(90,143,212,0.08)",border:"1px solid rgba(90,143,212,0.2)",borderRadius:8,padding:"8px 10px",marginBottom:4,fontSize:12}}>
                      <div style={{color:"#5a8fd4",fontWeight:600,marginBottom:5}}>Substitutes for {ing.name}:</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                        {(subs[ing.name]||[]).map((s,si)=>(
                          <span key={si} style={{background:"rgba(90,143,212,0.15)",color:"#a0c0f0",borderRadius:12,padding:"2px 8px"}}>{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {subFor===ing.name && !subs[ing.name] && subLoading===ing.name && (
                    <div style={{color:"#5a8fd4",fontSize:11,padding:"4px 0"}}>Finding substitutes...</div>
                  )}
                </div>
              ))}
            </div>
            {/* Details */}
            <div>
              <h3 style={{color:"#c8d0dc",fontSize:13,fontWeight:700,letterSpacing:.8,textTransform:"uppercase",marginBottom:10}}>Details</h3>
              {[["Prep",recipe.prepTime+"min"],["Cook",recipe.cookTime+"min"],["Total",total+"min"],["Servings",scale],["Calories",Math.round(recipe.nutrition.calories*r)+"kcal"],["Equipment",(recipe.equipment||[]).join(", ")]].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",fontSize:13}}>
                  <span style={{color:"#6a7a90"}}>{k}</span>
                  <span style={{color:"#c8d0dc"}}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Steps */}
          <h3 style={{color:"#c8d0dc",fontSize:13,fontWeight:700,letterSpacing:.8,textTransform:"uppercase",marginBottom:12}}>Preparation Steps</h3>
          {(recipe.steps||[]).map((step,i)=>{
            const timer = timers[i];
            return (
            <div key={i} style={{background:STEP_COLORS[i%STEP_COLORS.length]+"0a",border:"1px solid "+STEP_COLORS[i%STEP_COLORS.length]+"22",borderRadius:12,marginBottom:10,overflow:"hidden"}}>
              {step.image && <img src={step.image} alt="" style={{width:"100%",height:120,objectFit:"cover"}}/>}
              <div style={{padding:"12px 14px",display:"flex",gap:12,alignItems:"flex-start"}}>
                <div style={{width:26,height:26,borderRadius:"50%",background:STEP_COLORS[i%STEP_COLORS.length],color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:12,flexShrink:0}}>{i+1}</div>
                <div style={{flex:1}}>
                  <div style={{color:"#c8d0dc",fontSize:13,lineHeight:1.5}}>{step.text}</div>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginTop:6,flexWrap:"wrap"}}>
                    {step.timeMin && !timer && (
                      <button onClick={()=>startTimer(i)} style={{background:"rgba(90,173,142,0.15)",border:"1px solid rgba(90,173,142,0.3)",borderRadius:7,color:"#5aad8e",padding:"2px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                        ▶ {step.timeMin}min
                      </button>
                    )}
                    {timer && (
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{color:timer.remaining>0?"#ffd580":"#5aad8e",fontWeight:700,fontSize:14,fontVariantNumeric:"tabular-nums"}}>{fmtTime(timer.remaining)}</span>
                        <button onClick={()=>resetTimer(i)} style={{background:"rgba(200,60,60,0.15)",border:"1px solid rgba(200,60,60,0.3)",borderRadius:7,color:"#f08080",padding:"2px 8px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>↺</button>
                      </div>
                    )}
                    <button onClick={()=>genStepImg(i)} disabled={genIdx!==null}
                      style={{background:"rgba(142,90,173,0.2)",border:"1px solid rgba(180,130,255,0.3)",borderRadius:7,color:"#c8a8ff",padding:"2px 9px",fontSize:11,cursor:genIdx===null?"pointer":"not-allowed",fontFamily:"inherit"}}>
                      {genIdx===i ? "Generating..." : "AI Image"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            );
          })}

          {/* Meal Prep Container Layout */}
          {(() => {
            const {protein,grain,veggie} = getContainerSections();
            return (
              <div style={{marginTop:20,marginBottom:16}}>
                <h3 style={{color:"#c8d0dc",fontSize:13,fontWeight:700,letterSpacing:.8,textTransform:"uppercase",marginBottom:10}}>📦 Meal Prep Container Layout</h3>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,borderRadius:12,overflow:"hidden",border:"1px solid rgba(255,255,255,0.08)"}}>
                  {[["Protein","#5aad8e",protein],["Grain","#e2d9c8",grain],["Veggies","#d4875a",veggie]].map(([label,color,items])=>(
                    <div key={label} style={{background:color+"15",padding:"10px 12px",minHeight:80}}>
                      <div style={{color,fontWeight:700,fontSize:11,marginBottom:6,textTransform:"uppercase"}}>{label}</div>
                      {items.length===0
                        ? <div style={{color:"#4a5a70",fontSize:11}}>—</div>
                        : items.map((ing,i)=><div key={i} style={{color:"#c8d0dc",fontSize:11,marginBottom:3}}>{ing.name} <span style={{color:"#6a7a90"}}>{scaleAmt(ing.amount,r)} {ing.unit}</span></div>)
                      }
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Actions */}
          <div style={{display:"flex",gap:10,marginTop:16,flexWrap:"wrap"}}>
            {onRate && <button onClick={()=>onRate(recipe)} style={{...GB,flex:1}}>⭐ Rate Recipe</button>}
            {recipe.sourceUrl && (
              <a href={recipe.sourceUrl} target="_blank" rel="noreferrer" style={{...GB,textDecoration:"none",display:"inline-flex",alignItems:"center",gap:6,background:"rgba(90,143,212,0.15)",border:"1px solid rgba(90,143,212,0.3)",color:"#5a8fd4"}}>
                📺 View Original Source →
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ADD RECIPE MODAL ─────────────────────────────────────────────────────────
function SmartAddModal({onClose, onAdd}) {
  const [phase, setPhase] = useState("input");
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [imgUrlInput, setImgUrlInput] = useState("");
  const fileRef = useRef(null);

  const run = async () => {
    if (!inputVal.trim()) return;
    setLoading(true); setError(null); setPhase("loading");
    try {
      const result = await aiExtractRecipe(inputVal.trim());
      if (!result.image) result.image = makeFoodSVG(result.title, result.category);
      setData({...result, id:Date.now()});
      setPhase("review");
    } catch(e) {
      console.error("Recipe extraction error:", e);
      if (e.message === "NO_KEY") {
        setError("No API key — click ⚙️ in the topbar and add your Anthropic key first.");
      } else if (e.message && e.message.startsWith("HTTP")) {
        setError(`API error: ${e.message}. Check your Anthropic key is valid and has credits.`);
      } else {
        setError(`Extraction failed: ${e.message}. Try pasting the recipe text directly.`);
      }
      setPhase("input");
    }
    setLoading(false);
  };

  const save = () => { if(data) { onAdd(data); onClose(); } };
  const set = (k,v) => setData(d=>({...d,[k]:v}));

  return (
    <div className="modal-wrap" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}}>
      <div className="modal-inner" style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",border:"1px solid var(--border)",borderRadius:20,maxWidth:680,width:"100%",maxHeight:"92vh",overflowY:"auto",padding:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{color:"#fff",fontFamily:"'Playfair Display',serif",margin:0}}>Add Recipe</h2>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#6a7a90",cursor:"pointer",fontSize:22}}>×</button>
        </div>

        {phase==="input" && (
          <div>
            <p style={{color:"#8a9bb0",fontSize:14,marginBottom:16}}>Paste a URL (TikTok, Instagram, YouTube, any recipe site) or describe a recipe.</p>
            {error && <div style={{background:"rgba(192,80,80,0.15)",border:"1px solid rgba(192,80,80,0.3)",borderRadius:10,padding:"10px 14px",color:"#f08080",fontSize:13,marginBottom:14}}>{error}</div>}
            <textarea value={inputVal} onChange={e=>setInputVal(e.target.value)}
              style={{...IS,minHeight:100,resize:"vertical",marginBottom:14}}
              placeholder="https://www.tiktok.com/... or paste recipe text here..."/>
            <button onClick={run} style={{width:"100%",background:"linear-gradient(135deg,#3a7d5e,#5aad8e)",border:"none",borderRadius:12,color:"#fff",padding:14,fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
              Extract Recipe with AI
            </button>
          </div>
        )}

        {phase==="loading" && (
          <div style={{textAlign:"center",padding:"48px 0"}}>
            <div style={{fontSize:40,marginBottom:16,animation:"spin 2s linear infinite",display:"inline-block"}}>⏳</div>
            <div style={{color:"#5aad8e",fontSize:16,fontWeight:600}}>Extracting your recipe...</div>
            <div style={{color:"#6a7a90",fontSize:13,marginTop:8}}>Fetching page → reading content → building recipe</div>
          </div>
        )}

        {phase==="review" && data && (
          <div>
            <div style={{background:"rgba(58,125,94,0.1)",border:"1px solid rgba(58,125,94,0.25)",borderRadius:12,padding:"14px 16px",marginBottom:14,display:"flex",gap:14,alignItems:"center"}}>
              {data.image && <img src={data.image} alt="" style={{width:80,height:80,borderRadius:10,objectFit:"cover",flexShrink:0}} onError={e=>e.target.style.display='none'}/>}
              <div>
                <div style={{color:"#5aad8e",fontSize:11,fontWeight:700,marginBottom:4}}>✅ RECIPE EXTRACTED</div>
                <div style={{color:"#fff",fontWeight:700,fontFamily:"'Playfair Display',serif",fontSize:16}}>{data.title}</div>
                <NutriBadge n={data.nutrition}/>
              </div>
            </div>

            {/* Image upload */}
            <div style={{marginBottom:14,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:"12px 14px"}}>
              <div style={{color:"#6a7a90",fontSize:10,fontWeight:700,marginBottom:8,textTransform:"uppercase"}}>📷 Recipe Image (optional)</div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                {data.image && <img src={data.image} alt="" style={{width:56,height:56,borderRadius:8,objectFit:"cover",flexShrink:0}} onError={e=>e.target.style.display='none'}/>}
                <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}}
                  onChange={e=>{const f=e.target.files?.[0];if(f){const r=new FileReader();r.onload=ev=>setData(d=>({...d,image:ev.target.result}));r.readAsDataURL(f);}}}/>
                <button onClick={()=>fileRef.current?.click()} style={{...GB,padding:"6px 12px",fontSize:12}}>📁 Upload Photo</button>
                <input value={imgUrlInput} onChange={e=>setImgUrlInput(e.target.value)}
                  placeholder="Or paste image URL..."
                  style={{...IS,flex:1,minWidth:160,height:34,padding:"0 10px",fontSize:12}}/>
                <button onClick={()=>{if(imgUrlInput.trim()){setData(d=>({...d,image:imgUrlInput.trim()}));setImgUrlInput("");}}}
                  style={{...GB,padding:"6px 10px",fontSize:12}}>Use</button>
              </div>
            </div>

            {/* Editable fields */}
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10,marginBottom:12}}>
              <div>
                <div style={{color:"#6a7a90",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>Title</div>
                <input value={data.title} onChange={e=>set("title",e.target.value)} style={IS}/>
              </div>
              <div>
                <div style={{color:"#6a7a90",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>Category</div>
                <select value={data.category} onChange={e=>set("category",e.target.value)} style={IS}>
                  {["breakfast","lunch","dessert","drink"].map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
              {[["prepTime","Prep (min)"],["cookTime","Cook (min)"],["servings","Servings"]].map(([k,l])=>(
                <div key={k}>
                  <div style={{color:"#6a7a90",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>{l}</div>
                  <input type="number" value={data[k]||""} onChange={e=>set(k,+e.target.value)} style={IS}/>
                </div>
              ))}
            </div>

            <div style={{marginBottom:12}}>
              <div style={{color:"#6a7a90",fontSize:10,fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>Tags</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {ALL_TAGS.map(t=>{const on=(data.tags||[]).includes(t);return(
                  <button key={t} onClick={()=>set("tags",on?data.tags.filter(x=>x!==t):[...(data.tags||[]),t])}
                    style={{...CB,background:on?(ALL_TAG_COLORS[t]||"#3a7d5e")+"28":"rgba(255,255,255,0.04)",color:on?(ALL_TAG_COLORS[t]||"#5aad8e"):"#6a7a90",border:on?"1px solid "+(ALL_TAG_COLORS[t]||"#3a7d5e"):"1px solid rgba(255,255,255,0.08)"}}>
                    {on?"✓ ":""}{t}
                  </button>
                );})}
              </div>
            </div>

            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{setPhase("input");setData(null);}} style={{...GB,flex:1}}>← Try Again</button>
              <button onClick={save} style={{flex:2,background:"linear-gradient(135deg,#3a7d5e,#5aad8e)",border:"none",borderRadius:12,color:"#fff",padding:14,fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
                💾 Save Recipe
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MIX & MATCH ─────────────────────────────────────────────────────────────
function MixMatch({recipes, onAddToMealPlan, onSaveAsRecipe}) {
  const [sel, setSel] = useState({protein:null,grain:null,side:null});
  const [portions, setPortions] = useState(1);
  const [mealsPerDay, setMealsPerDay] = useState(1);
  const [comboName, setComboName] = useState("");
  const [saved, setSaved] = useState(false);

  const proteins = recipes.filter(r=>(r.type||{}).protein);
  const grains = recipes.filter(r=>(r.type||{}).grain);
  const sides = recipes.filter(r=>(r.type||{}).side||r.category==="dessert"||r.category==="drink");

  const combined = Object.values(sel).filter(Boolean);
  const totN = combined.reduce((a,r)=>({calories:a.calories+Math.round(r.nutrition.calories*portions),protein:a.protein+Math.round(r.nutrition.protein*portions),carbs:a.carbs+Math.round(r.nutrition.carbs*portions),fat:a.fat+Math.round(r.nutrition.fat*portions)}),{calories:0,protein:0,carbs:0,fat:0});
  const dailyN = {calories:totN.calories*mealsPerDay,protein:totN.protein*mealsPerDay,carbs:totN.carbs*mealsPerDay,fat:totN.fat*mealsPerDay};
  const totTime = combined.reduce((a,r)=>a+(r.totalTime||(r.prepTime||0)+(r.cookTime||0)),0);
  const allAllergens = [...new Set(combined.flatMap(r=>r.allergens||[]))];

  const handleSave = () => {
    if (!combined.length) return;
    const name = comboName.trim() || combined.map(r=>r.title).join(" + ");
    onAddToMealPlan({type:"combo",name,recipes:combined,portions,mealsPerDay,nutrition:totN,dailyNutrition:dailyN,time:totTime,allergens:allAllergens,id:Date.now()});
    setSaved(true); setTimeout(()=>setSaved(false),2500);
  };

  const handleSaveAsRecipe = () => {
    if (!combined.length || !onSaveAsRecipe) return;
    const name = comboName.trim() || combined.map(r=>r.title).join(" + ");
    const mergedIng = [];
    const seen = {};
    combined.forEach(r=>(r.ingredients||[]).forEach(ing=>{
      const k = ing.name.toLowerCase();
      if (seen[k]) seen[k].amount += ing.amount*portions;
      else { const ni={...ing,amount:ing.amount*portions}; mergedIng.push(ni); seen[k]=ni; }
    }));
    onSaveAsRecipe({id:Date.now(),title:name,category:"lunch",image:null,tags:[...new Set(combined.flatMap(r=>r.tags||[]))],allergens:allAllergens,equipment:[...new Set(combined.flatMap(r=>r.equipment||[]))],type:{protein:combined.some(r=>(r.type||{}).protein),grain:combined.some(r=>(r.type||{}).grain),side:false},nutrition:totN,goal:[...new Set(combined.flatMap(r=>r.goal||[]))],ingredients:mergedIng,steps:combined.flatMap((r,ri)=>(r.steps||[]).map(s=>({...s,text:"["+r.title+"] "+s.text}))),servings:portions,prepTime:combined.reduce((a,r)=>a+(r.prepTime||0),0),cookTime:combined.reduce((a,r)=>a+(r.cookTime||0),0),totalTime:totTime,difficulty:"intermediate",healthBenefits:""});
    setSaved(true); setTimeout(()=>setSaved(false),2500);
  };

  const Slot = ({label,key2,options,fallback}) => (
    <div style={{flex:1,minWidth:160}}>
      <div style={{color:"#8a9bb0",fontSize:10,fontWeight:700,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>{label}</div>
      {!options.length
        ? <div style={{color:"#5a6a7a",fontSize:12,padding:12,background:"rgba(255,255,255,0.03)",borderRadius:10,textAlign:"center",border:"1px dashed rgba(255,255,255,0.08)"}}>{fallback}</div>
        : options.map(r=>(
          <button key={r.id} onClick={()=>setSel(s=>({...s,[key2]:(s[key2]&&s[key2].id===r.id)?null:r}))}
            style={{width:"100%",background:(sel[key2]&&sel[key2].id===r.id)?"rgba(58,125,94,0.2)":"rgba(255,255,255,0.03)",border:"1px solid "+((sel[key2]&&sel[key2].id===r.id)?"#3a7d5e":"rgba(255,255,255,0.07)"),borderRadius:10,padding:"8px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:9,marginBottom:5,fontFamily:"inherit"}}>
            <SmartImage recipe={r} style={{width:36,height:36,borderRadius:7,flexShrink:0}}/>
            <div style={{textAlign:"left",flex:1,minWidth:0}}>
              <div style={{color:"#e2d9c8",fontSize:12,fontWeight:600,lineHeight:1.3}}>{r.title}</div>
              <div style={{color:"#6a7a90",fontSize:11}}>{r.nutrition.calories}kcal · {r.totalTime||(r.prepTime||0)+(r.cookTime||0)}min</div>
            </div>
            {sel[key2]&&sel[key2].id===r.id&&<span style={{color:"#5aad8e"}}>✓</span>}
          </button>
        ))
      }
    </div>
  );

  return (
    <div>
      <h2 style={{color:"#fff",fontFamily:"'Playfair Display',serif",marginBottom:4}}>Mix & Match</h2>
      <p style={{color:"#8a9bb0",fontSize:13,marginBottom:18}}>Build a custom meal — adjust portions, then save to your plan or as a new recipe.</p>

      <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:14,padding:"14px 18px",marginBottom:18,display:"flex",gap:24,flexWrap:"wrap",alignItems:"center"}}>
        {[["Portions/person",portions,setPortions,1,10],["Meals/day",mealsPerDay,setMealsPerDay,1,6]].map(([lbl,val,fn,mn,mx])=>(
          <div key={lbl} style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{color:"#c8d0dc",fontSize:13,whiteSpace:"nowrap"}}>{lbl}</span>
            <button onClick={()=>fn(v=>Math.max(mn,v-1))} style={{...GB,padding:"3px 11px"}}>−</button>
            <span style={{color:"#fff",fontWeight:700,fontSize:20,minWidth:24,textAlign:"center"}}>{val}</span>
            <button onClick={()=>fn(v=>Math.min(mx,v+1))} style={{...GB,padding:"3px 11px"}}>+</button>
          </div>
        ))}
      </div>

      <div style={{display:"flex",gap:14,marginBottom:20,flexWrap:"wrap"}}>
        <Slot label="Protein" key2="protein" options={proteins.length?proteins:recipes.slice(0,4)} fallback="No protein recipes yet"/>
        <Slot label="Grain / Base" key2="grain" options={grains.length?grains:recipes.slice(0,4)} fallback="No grain recipes yet"/>
        <Slot label="Side / Drink" key2="side" options={sides.length?sides:recipes.slice(0,4)} fallback="No side recipes yet"/>
      </div>

      {combined.length>0 && (
        <div style={{background:"linear-gradient(135deg,rgba(58,125,94,0.1),rgba(90,143,212,0.06))",border:"1px solid rgba(58,125,94,0.28)",borderRadius:16,padding:20}}>
          <div style={{color:"#5aad8e",fontWeight:700,fontSize:11,marginBottom:10,letterSpacing:.8}}>✨ COMBO · {portions} portion{portions!==1?"s":""}/person · {mealsPerDay}x/day · <span style={{color:"#c8a8ff"}}>{portions*mealsPerDay} total serving{portions*mealsPerDay!==1?"s":""}/day</span></div>
          <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:14}}>
            {combined.map(r=><span key={r.id} style={{background:"rgba(58,125,94,0.2)",color:"#5aad8e",border:"1px solid rgba(58,125,94,0.38)",borderRadius:20,padding:"4px 12px",fontSize:13,fontWeight:600}}>{r.title}</span>)}
          </div>
          <div style={{marginBottom:10}}>
            <div style={{color:"#8a9bb0",fontSize:11,fontWeight:700,marginBottom:5}}>PER SERVING ({portions}×)</div>
            <NutriBadge n={totN}/>
          </div>
          {mealsPerDay>1 && <div style={{marginBottom:12}}>
            <div style={{color:"#8a9bb0",fontSize:11,fontWeight:700,marginBottom:5}}>DAILY TOTAL ({mealsPerDay} meals)</div>
            <NutriBadge n={dailyN}/>
          </div>}
          {totTime>0 && <div style={{color:"#5a8fd4",fontSize:12,marginBottom:14}}>⏱ ~{totTime}min cook time</div>}
          {allAllergens.length>0 && <div style={{color:"#f08080",fontSize:12,marginBottom:14}}>⚠ {allAllergens.join(", ")}</div>}
          <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
            <input value={comboName} onChange={e=>setComboName(e.target.value)} placeholder="Name this combo (optional)..."
              style={{...IS,flex:1,minWidth:160,fontSize:13,padding:"8px 12px"}}/>
            <button onClick={handleSave} style={{background:saved?"rgba(58,125,94,0.55)":"linear-gradient(135deg,#3a7d5e,#5aad8e)",border:"none",borderRadius:11,color:"#fff",padding:"10px 16px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
              {saved?"✓ Saved!":"📅 Add to Plan"}
            </button>
            {onSaveAsRecipe && <button onClick={handleSaveAsRecipe} style={{...GB,whiteSpace:"nowrap"}}>💾 Save as Recipe</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MEAL PREP OPTIMIZER ─────────────────────────────────────────────────────
function MealPrepOptimizer({recipes, onAddToMealPlan}) {
  const [selected, setSelected] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const toggle = id => setSelected(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]);

  const optimize = async () => {
    const key = typeof localStorage !== 'undefined' && localStorage.getItem('anthropic_key');
    if (!key) { alert("Add your Anthropic API key first."); return; }
    const sel = recipes.filter(r=>selected.includes(r.id));
    if (sel.length < 2) return;
    setLoading(true); setResult(null);
    try {
      const list = sel.map((r,i)=>`${i+1}. ${r.title} (${r.totalTime||((r.prepTime||0)+(r.cookTime||0))}min, steps: ${(r.steps||[]).map(s=>s.text.slice(0,40)).join("; ")})`).join("\n");
      const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1000,messages:[{role:"user",content:"You are a meal prep expert. Given these recipes:\n"+list+"\n\nCreate an optimized parallel cooking workflow. List steps in order of execution. Mark steps that can happen simultaneously with [PARALLEL]. Format as numbered steps. Estimate total time saved."}]})});
      if (res.ok) {
        const d = await res.json();
        setResult((d.content||[]).map(c=>c.text||"").join("").trim());
      }
    } catch(e){}
    setLoading(false);
  };

  const PREP_TIPS = [
    "Batch cook grains (rice, quinoa) all at once — they keep 5 days in the fridge.",
    "Use a sheet pan for proteins while stovetop handles veggies simultaneously.",
    "Pre-chop and store vegetables in airtight containers for 3-4 days.",
  ];

  return (
    <div>
      <h2 style={{color:"#fff",fontFamily:"'Playfair Display',serif",marginBottom:6}}>⚡ Meal Prep Optimizer</h2>
      <p style={{color:"#8a9bb0",fontSize:13,marginBottom:20}}>Select 2+ recipes and get an AI-optimized parallel cooking workflow.</p>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10,marginBottom:20}}>
        {recipes.map(r=>(
          <button key={r.id} onClick={()=>toggle(r.id)}
            style={{background:selected.includes(r.id)?"rgba(58,125,94,0.2)":"rgba(255,255,255,0.03)",border:"1px solid "+(selected.includes(r.id)?"#3a7d5e":"rgba(255,255,255,0.08)"),borderRadius:12,padding:"10px 14px",cursor:"pointer",textAlign:"left",fontFamily:"inherit",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18}}>{selected.includes(r.id)?"✅":"⬜"}</span>
            <div>
              <div style={{color:"#e2d9c8",fontWeight:600,fontSize:13}}>{r.title}</div>
              <div style={{color:"#6a7a90",fontSize:11,marginTop:2}}>{r.totalTime||((r.prepTime||0)+(r.cookTime||0))}min</div>
            </div>
          </button>
        ))}
      </div>

      <button onClick={optimize} disabled={selected.length<2||loading}
        style={{background:selected.length>=2&&!loading?"linear-gradient(135deg,#5a8fd4,#3a5fa0)":"rgba(255,255,255,0.05)",border:"none",borderRadius:12,color:selected.length>=2&&!loading?"#fff":"#5a6a7a",padding:"12px 24px",fontWeight:700,fontSize:14,cursor:selected.length>=2&&!loading?"pointer":"not-allowed",fontFamily:"inherit",marginBottom:20}}>
        {loading?"⏳ Optimizing...":"⚡ Optimize Workflow"}
      </button>

      {result && (
        <div style={{background:"rgba(90,143,212,0.07)",border:"1px solid rgba(90,143,212,0.2)",borderRadius:14,padding:18,marginBottom:20}}>
          <div style={{color:"#5a8fd4",fontWeight:700,fontSize:13,marginBottom:12}}>⚡ Optimized Workflow</div>
          {result.split("\n").filter(l=>l.trim()).map((line,i)=>{
            const isParallel = line.includes("[PARALLEL]");
            return (
              <div key={i} style={{display:"flex",gap:10,marginBottom:8,alignItems:"flex-start"}}>
                <div style={{color:"#e2d9c8",fontSize:13,lineHeight:1.5,flex:1,background:isParallel?"rgba(90,143,212,0.12)":"transparent",borderRadius:isParallel?7:0,padding:isParallel?"4px 8px":"0",border:isParallel?"1px solid rgba(90,143,212,0.3)":"none"}}>
                  {line}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{background:"rgba(90,173,142,0.07)",border:"1px solid rgba(90,173,142,0.2)",borderRadius:14,padding:18}}>
        <div style={{color:"#5aad8e",fontWeight:700,fontSize:13,marginBottom:10}}>🥘 Prep Tips</div>
        {PREP_TIPS.map((tip,i)=>(
          <div key={i} style={{display:"flex",gap:10,marginBottom:8,alignItems:"flex-start"}}>
            <span style={{color:"#5aad8e",flexShrink:0}}>•</span>
            <div style={{color:"#c8d0dc",fontSize:13,lineHeight:1.5}}>{tip}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MEAL PLAN MANAGER ───────────────────────────────────────────────────────
function MealPlanManager({recipes, mealPlanItems, setMealPlanItems}) {
  const [tab, setTab] = useState("plan");
  const [people, setPeople] = useState(2);
  const [weeks, setWeeks] = useState(1);
  const [addRec, setAddRec] = useState(null);
  const [addPortions, setAddPortions] = useState(1);
  const [addDay, setAddDay] = useState("Monday");
  const [bySection, setBySection] = useState(false);
  const [budget, setBudget] = useState(70);
  const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

  const SECTION_KEYWORDS = {
    produce: /onion|garlic|tomato|pepper|spinach|carrot|celery|broccoli|mushroom|zucchini|avocado|lemon|lime|fruit|berry|apple|banana|herb|basil|cilantro|parsley/,
    meat: /chicken|beef|salmon|tuna|fish|shrimp|egg|turkey|pork|lamb|meat|protein/,
    dairy: /milk|cheese|yogurt|butter|cream|cheddar|mozzarella|feta|parmesan|whey/,
    grains: /rice|oat|quinoa|pasta|flour|bread|noodle|cereal|tortilla|oil|sauce|vinegar|soy|salt|pepper|spice|cumin|paprika|oregano|sugar|honey|nut|almond|seed/,
  };
  const SECTION_INFO = [
    {key:"produce",label:"Produce",icon:"🥦",color:"#5aad8e",cost:2},
    {key:"meat",label:"Meat & Fish",icon:"🥩",color:"#d4875a",cost:8},
    {key:"dairy",label:"Dairy",icon:"🧀",color:"#ffd580",cost:4},
    {key:"grains",label:"Grains & Pantry",icon:"🌾",color:"#c8a8ff",cost:3},
    {key:"other",label:"Other",icon:"🛒",color:"#8a9bb0",cost:2},
  ];

  const categorizeItem = name => {
    const n = (name||"").toLowerCase();
    for (const [key,rx] of Object.entries(SECTION_KEYWORDS)) if (rx.test(n)) return key;
    return "other";
  };

  const addItem = () => {
    if (!addRec) return;
    setMealPlanItems(p=>[...p,{type:"recipe",name:addRec.title,recipe:addRec,portions:addPortions,day:addDay,nutrition:{calories:Math.round(addRec.nutrition.calories*addPortions),protein:Math.round(addRec.nutrition.protein*addPortions),carbs:Math.round(addRec.nutrition.carbs*addPortions),fat:Math.round(addRec.nutrition.fat*addPortions)},id:Date.now()}]);
    setAddRec(null); setAddPortions(1);
  };

  const buildList = () => {
    const m = {};
    mealPlanItems.forEach(item=>{
      const recs = item.type==="combo"?(item.recipes||[]):[item.recipe].filter(Boolean);
      recs.forEach(r=>(r.ingredients||[]).forEach(ing=>{
        const k = ing.name.toLowerCase();
        const amt = ing.amount*(item.portions||1)*people*weeks;
        if (m[k]) m[k].amount += amt;
        else m[k]={name:ing.name,amount:amt,unit:ing.unit};
      }));
    });
    return Object.values(m).sort((a,b)=>a.name.localeCompare(b.name));
  };

  const shoppingList = mealPlanItems.length ? buildList() : [];

  const estimateCost = list => list.reduce((total, item) => {
    const sec = SECTION_INFO.find(s=>s.key===categorizeItem(item.name)) || SECTION_INFO[4];
    return total + sec.cost * Math.max(0.5, item.amount/2);
  }, 0);

  const totalCost = estimateCost(shoppingList);

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{color:"#fff",fontFamily:"'Playfair Display',serif",margin:"0 0 4px"}}>Meal Plan</h2>
          <p style={{color:"#8a9bb0",fontSize:13,margin:0}}>{mealPlanItems.length} meals planned</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          {["plan","shopping"].map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{...GB,background:tab===t?"rgba(58,125,94,0.22)":"rgba(255,255,255,0.05)",color:tab===t?"#5aad8e":"#8a9bb0",border:tab===t?"1px solid #3a7d5e":"1px solid rgba(255,255,255,0.09)",borderRadius:20,padding:"7px 18px",fontSize:13}}>
              {t==="plan"?"📅 Weekly Plan":"🛒 Shopping List"}
            </button>
          ))}
        </div>
      </div>

      {tab==="plan" && (
        <div>
          <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:14,padding:16,marginBottom:18}}>
            <div style={{color:"#c8d0dc",fontWeight:600,fontSize:14,marginBottom:12}}>➕ Add recipe to plan</div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
              <div style={{flex:2,minWidth:160}}>
                <div style={{color:"#8a9bb0",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>Recipe</div>
                <select value={(addRec&&addRec.id)||""} onChange={e=>{const r=recipes.find(x=>x.id===+e.target.value);setAddRec(r||null);}} style={IS}>
                  <option value="">— Select —</option>
                  {recipes.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}
                </select>
              </div>
              <div>
                <div style={{color:"#8a9bb0",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>Portions</div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <button onClick={()=>setAddPortions(v=>Math.max(1,v-1))} style={{...GB,padding:"5px 10px"}}>−</button>
                  <span style={{color:"#fff",fontWeight:700,minWidth:20,textAlign:"center"}}>{addPortions}</span>
                  <button onClick={()=>setAddPortions(v=>v+1)} style={{...GB,padding:"5px 10px"}}>+</button>
                </div>
              </div>
              <div style={{flex:1,minWidth:130}}>
                <div style={{color:"#8a9bb0",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>Day</div>
                <select value={addDay} onChange={e=>setAddDay(e.target.value)} style={IS}>
                  {DAYS.map(d=><option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <button onClick={addItem} disabled={!addRec} style={{background:addRec?"linear-gradient(135deg,#3a7d5e,#5aad8e)":"rgba(255,255,255,0.05)",border:"none",borderRadius:10,color:addRec?"#fff":"#5a6a7a",padding:"11px 18px",fontWeight:700,fontSize:13,cursor:addRec?"pointer":"not-allowed",fontFamily:"inherit"}}>Add</button>
            </div>
          </div>

          {mealPlanItems.length===0
            ? <div style={{textAlign:"center",padding:"48px 0",color:"#5a6a7a"}}><div style={{fontSize:42,marginBottom:10}}>📅</div><div style={{fontSize:15,color:"#8a9bb0"}}>No meals planned yet</div></div>
            : <div style={{display:"grid",gap:10}}>
                {DAYS.map(day=>{
                  const items = mealPlanItems.filter(i=>i.day===day);
                  if (!items.length) return null;
                  const dayKcal = items.reduce((a,i)=>a+((i.nutrition&&i.nutrition.calories)||0),0);
                  return (
                    <div key={day} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:14,overflow:"hidden"}}>
                      <div style={{padding:"10px 16px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{color:"#c8d0dc",fontWeight:700,fontSize:14}}>{day}</span>
                        {dayKcal>0 && <span style={{color:"#6a7a90",fontSize:12}}>{dayKcal} kcal</span>}
                      </div>
                      <div style={{padding:"10px 12px",display:"grid",gap:8}}>
                        {items.map(item=>(
                          <div key={item.id} style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"8px 12px",border:"1px solid rgba(255,255,255,0.06)"}}>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{color:"#e2d9c8",fontWeight:600,fontSize:13}}>{item.name}</div>
                              <div style={{color:"#6a7a90",fontSize:11,marginTop:2}}>{item.portions} portion{item.portions!==1?"s":""}{item.nutrition&&item.nutrition.calories?" · "+item.nutrition.calories+"kcal":""}</div>
                            </div>
                            <button onClick={()=>setMealPlanItems(p=>p.filter(i=>i.id!==item.id))} style={{background:"rgba(200,60,60,0.12)",border:"1px solid rgba(200,60,60,0.2)",color:"#f88",borderRadius:7,cursor:"pointer",padding:"4px 9px",fontSize:12}}>✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
          }
        </div>
      )}

      {tab==="shopping" && (
        <div>
          <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:14,padding:"14px 18px",marginBottom:14,display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
            {[["People",people,setPeople,1,20],["Weeks",weeks,setWeeks,1,4]].map(([lbl,val,fn,mn,mx])=>(
              <div key={lbl} style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{color:"#c8d0dc",fontSize:13}}>{lbl}</span>
                <button onClick={()=>fn(v=>Math.max(mn,v-1))} style={{...GB,padding:"3px 11px"}}>−</button>
                <span style={{color:"#fff",fontWeight:700,fontSize:18,minWidth:22,textAlign:"center"}}>{val}</span>
                <button onClick={()=>fn(v=>Math.min(mx,v+1))} style={{...GB,padding:"3px 11px"}}>+</button>
              </div>
            ))}
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{color:"#c8d0dc",fontSize:13}}>Budget $</span>
              <input type="number" value={budget} onChange={e=>setBudget(+e.target.value)} style={{...IS,width:70,padding:"4px 8px",fontSize:13}}/>
              <span style={{color:"#6a7a90",fontSize:12}}>/week</span>
            </div>
            <button onClick={()=>setBySection(s=>!s)} style={{...GB,background:bySection?"rgba(58,125,94,0.22)":"rgba(255,255,255,0.05)",color:bySection?"#5aad8e":"#8a9bb0"}}>
              {bySection?"📋 All Items":"🏪 By Section"}
            </button>
            <button onClick={()=>{const txt=shoppingList.map(i=>i.name+": "+i.amount.toFixed(1)+" "+i.unit).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([txt],{type:"text/plain"}));a.download="shopping-list.txt";a.click();}} style={{...GB,marginLeft:"auto"}}>📄 Export</button>
          </div>

          {shoppingList.length>0 && (
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:14,padding:"12px 16px",marginBottom:14,display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
              <div style={{flex:1}}>
                <span style={{color:"#c8d0dc",fontSize:13}}>Estimated Total: </span>
                <span style={{color:"#ffd580",fontWeight:700,fontSize:15}}>${totalCost.toFixed(2)}</span>
                <span style={{color:"#6a7a90",fontSize:12}}> / {budget} budget</span>
              </div>
              <span style={{fontWeight:700,fontSize:13,color:totalCost<=budget?"#5aad8e":"#f08080"}}>
                {totalCost<=budget?"Under budget ✓":"Over budget ✗"}
              </span>
            </div>
          )}

          {shoppingList.length>0 && (
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
              {[
                ["🛒 Instacart","https://www.instacart.com/store/"+encodeURIComponent(shoppingList[0]?.name||"")],
                ["📦 Amazon Fresh","https://www.amazon.com/s?k="+shoppingList.slice(0,3).map(i=>encodeURIComponent(i.name)).join("+")+"grocery"],
                ["🏪 Walmart","https://www.walmart.com/search?q="+shoppingList.slice(0,3).map(i=>encodeURIComponent(i.name)).join("+")],
              ].map(([label,url])=>(
                <a key={label} href={url} target="_blank" rel="noreferrer"
                  style={{...GB,textDecoration:"none",display:"inline-flex",alignItems:"center",background:"rgba(90,143,212,0.1)",border:"1px solid rgba(90,143,212,0.25)",color:"#7ab0e8",fontSize:12}}>
                  {label}
                </a>
              ))}
            </div>
          )}

          {shoppingList.length===0
            ? <div style={{textAlign:"center",padding:"48px 0",color:"#5a6a7a"}}><div style={{fontSize:38,marginBottom:10}}>🛒</div><div style={{fontSize:14,color:"#8a9bb0"}}>Add meals to your plan first</div></div>
            : bySection
              ? SECTION_INFO.map(sec=>{
                  const items = shoppingList.filter(item=>categorizeItem(item.name)===sec.key);
                  if (!items.length) return null;
                  return (
                    <div key={sec.key} style={{marginBottom:14}}>
                      <div style={{color:sec.color,fontWeight:700,fontSize:13,marginBottom:8}}>{sec.icon} {sec.label}</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
                        {items.map((item,i)=>(
                          <div key={i} style={{display:"flex",justifyContent:"space-between",background:"rgba(255,255,255,0.04)",borderRadius:9,padding:"8px 12px",border:"1px solid "+sec.color+"25"}}>
                            <span style={{color:"#c8d0dc",fontSize:13}}>{item.name}</span>
                            <span style={{color:sec.color,fontWeight:700,fontSize:13}}>{item.amount.toFixed(1)} {item.unit}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              : <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
                  {shoppingList.map((item,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",background:"rgba(255,255,255,0.04)",borderRadius:9,padding:"8px 12px",border:"1px solid rgba(255,255,255,0.06)"}}>
                      <span style={{color:"#c8d0dc",fontSize:13}}>🟢 {item.name}</span>
                      <span style={{color:"#5aad8e",fontWeight:700,fontSize:13}}>{item.amount.toFixed(1)} {item.unit}</span>
                    </div>
                  ))}
                </div>
          }
        </div>
      )}
    </div>
  );
}

// ─── FAVORITES VIEW ───────────────────────────────────────────────────────────
function FavoritesView({favorites, recipes, setFavorites, onView, onExportBook}) {
  const favRecipes = favorites.map(f=>recipes.find(r=>r.id===f.id)||f).filter(Boolean);
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{color:"#fff",fontFamily:"'Playfair Display',serif",margin:"0 0 4px"}}>Favorites</h2>
          <p style={{color:"#8a9bb0",fontSize:13,margin:0}}>{favRecipes.length} saved recipes</p>
        </div>
        {favRecipes.length>0 && (
          <button onClick={()=>exportMealBookToPDF(favRecipes,"My Favorite Recipes")} style={{...GB}}>📚 Export Cookbook PDF</button>
        )}
      </div>
      {favRecipes.length===0
        ? <div style={{textAlign:"center",padding:"70px 0"}}>
            <div style={{fontSize:48,marginBottom:14}}>♡</div>
            <div style={{color:"#fff",fontSize:17,fontFamily:"'Playfair Display',serif",marginBottom:6}}>No favorites yet</div>
            <div style={{color:"#6a7a90",fontSize:13}}>Tap the heart on any recipe to save it here</div>
          </div>
        : <div className="r-grid">
            {favRecipes.map(r=>(
              <RecipeCard key={r.id} recipe={r} onClick={onView}
                onFavorite={()=>setFavorites(p=>p.filter(f=>f.id!==r.id))} isFavorite={true}/>
            ))}
          </div>
      }
    </div>
  );
}

// ─── INGREDIENT SEARCH ────────────────────────────────────────────────────────
function IngredientSearch({recipes, onView}) {
  const [query, setQuery] = useState("");
  const results = query.trim().length>1
    ? recipes.filter(r=>(r.ingredients||[]).some(i=>(i.name||"").toLowerCase().includes(query.toLowerCase())))
    : [];
  return (
    <div>
      <h2 style={{color:"#fff",fontFamily:"'Playfair Display',serif",marginBottom:6}}>Ingredient Search</h2>
      <p style={{color:"#8a9bb0",fontSize:13,marginBottom:18}}>Find recipes by ingredient</p>
      <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="e.g. chicken, quinoa, matcha..."
        style={{...IS,marginBottom:20,fontSize:15}}/>
      {query.trim().length>1 && (
        results.length===0
          ? <div style={{textAlign:"center",padding:"48px 0",color:"#5a6a7a"}}>No recipes found with "{query}"</div>
          : <div className="r-grid">
              {results.map(r=><RecipeCard key={r.id} recipe={r} onClick={onView}/>)}
            </div>
      )}
    </div>
  );
}

// ─── RATING MODAL ─────────────────────────────────────────────────────────────
function RatingModal({recipe, existing, onSave, onClose}) {
  const [taste, setTaste] = useState((existing&&existing.taste)||0);
  const [difficulty, setDifficulty] = useState((existing&&existing.difficulty)||0);
  const [timeAccuracy, setTimeAccuracy] = useState((existing&&existing.timeAccuracy)||0);
  const [spice, setSpice] = useState((existing&&existing.spice)||0);
  const Stars = ({val,set}) => (
    <div style={{display:"flex",gap:4}}>
      {[1,2,3,4,5].map(i=>(
        <button key={i} onClick={()=>set(i)} style={{background:"none",border:"none",cursor:"pointer",fontSize:28,color:i<=val?"#ffd580":"#2a3444",padding:2}}>★</button>
      ))}
    </div>
  );
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:1001,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#0d0f17",border:"1px solid rgba(255,255,255,0.08)",borderRadius:20,padding:28,maxWidth:400,width:"100%"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h3 style={{color:"#fff",fontFamily:"'Playfair Display',serif",margin:0}}>Rate: {recipe.title}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#6a7a90",cursor:"pointer",fontSize:22}}>×</button>
        </div>
        {[["⭐ Taste",taste,setTaste],["💪 Difficulty",difficulty,setDifficulty],["🕐 Time Accuracy",timeAccuracy,setTimeAccuracy],["🌶 Spice",spice,setSpice]].map(([label,val,set])=>(
          <div key={label} style={{marginBottom:16}}>
            <div style={{color:"#8a9bb0",fontSize:13,marginBottom:8}}>{label}</div>
            <Stars val={val} set={set}/>
          </div>
        ))}
        <button onClick={()=>{onSave(recipe.id,{taste,difficulty,timeAccuracy,spice});onClose();}} style={{width:"100%",background:"linear-gradient(135deg,#3a7d5e,#5aad8e)",border:"none",borderRadius:12,color:"#fff",padding:14,fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
          Save Rating
        </button>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [recipes, setRecipes] = useState(SAMPLE_RECIPES);
  const [sec, setSec] = useState("dashboard");
  const [catF, setCatF] = useState("all");
  const [tagF, setTagF] = useState(null);
  const [healthF, setHealthF] = useState(null);
  const [goalF, setGoalF] = useState(null);
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [favorites, setFavorites] = useState([]);
  const [mealPlanItems, setMealPlanItems] = useState([]);
  const [ratings, setRatings] = useState({});
  const [ratingTarget, setRatingTarget] = useState(null);
  const [pexelsKey, setPexelsKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tipIdx, setTipIdx] = useState(0);
  const [darkMode, setDarkMode] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    setAnthropicKey(localStorage.getItem('anthropic_key') || '');
    setPexelsKey(localStorage.getItem('pexels_key') || '');
    setDarkMode(localStorage.getItem('dark_mode') !== 'false');
    const check = () => { const m = window.innerWidth < 768; setIsMobile(m); if(m) setSidebar(false); };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const iv = setInterval(()=>setTipIdx(i=>(i+1)%4), 5000);
    return () => clearInterval(iv);
  }, []);

  const filtered = recipes.filter(r => {
    if (catF!=="all" && r.category!==catF) return false;
    if (tagF && !(r.tags||[]).includes(tagF)) return false;
    if (healthF && !(r.tags||[]).includes(healthF)) return false;
    if (goalF && !(r.goal||[]).includes(goalF)) return false;
    if (search && !(r.title||"").toLowerCase().includes(search.toLowerCase()) &&
        !(r.ingredients||[]).some(i=>(i.name||"").toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  const navItems = [
    {id:"dashboard",label:"Dashboard",icon:"🏠"},
    {id:"recipes",label:"Recipes",icon:"📖"},
    {id:"mix-match",label:"Mix & Match",icon:"🔀"},
    {id:"meal-plan",label:"Meal Plan",icon:"📅"},
    {id:"optimizer",label:"Optimizer",icon:"⚡"},
    {id:"ingredient-search",label:"Ingredients",icon:"🔍"},
    {id:"favorites",label:"Favorites",icon:"♥"},
  ];

  const toggleFav = r => setFavorites(p=>p.some(f=>f.id===r.id)?p.filter(f=>f.id!==r.id):[...p,{id:r.id}]);
  const isFav = r => favorites.some(f=>f.id===r.id);

  const toggleDark = () => setDarkMode(d => { const nd = !d; if(typeof localStorage!=='undefined') localStorage.setItem('dark_mode',String(nd)); return nd; });

  const navTo = (id) => { setSec(id); if(isMobile) setSidebar(false); };

  return (
    <div data-theme={darkMode?"dark":"light"} style={{display:"flex",height:"100vh",background:"var(--bg)",fontFamily:"'DM Sans',sans-serif",overflow:"hidden",color:"var(--text)"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        [data-theme="dark"]{
          --bg:#1a1d2a;--bg-card:#1e2133;--bg-sidebar:#161924;--nm-input-bg:#141722;
          --shadow-dark:#0d1020;--shadow-light:#27304a;
          --text:#dce4f8;--text-sub:#7a88a8;--text-muted:#4a5a70;
          --accent:#5aad8e;--accent2:#3a7d5e;
          --nm-raised:8px 8px 16px var(--shadow-dark),-8px -8px 16px var(--shadow-light);
          --nm-raised-sm:4px 4px 8px var(--shadow-dark),-4px -4px 8px var(--shadow-light);
          --nm-inset:inset 4px 4px 8px var(--shadow-dark),inset -4px -4px 8px var(--shadow-light);
          --border:rgba(255,255,255,0.06);--card-hover:rgba(255,255,255,0.03);
        }
        [data-theme="light"]{
          --bg:#e4e8f2;--bg-card:#edf0f8;--bg-sidebar:#dde1ed;--nm-input-bg:#d8dce8;
          --shadow-dark:#b8bcca;--shadow-light:#ffffff;
          --text:#1a1e30;--text-sub:#4a5270;--text-muted:#8a90a8;
          --accent:#3a7d5e;--accent2:#5aad8e;
          --nm-raised:8px 8px 16px var(--shadow-dark),-8px -8px 16px var(--shadow-light);
          --nm-raised-sm:4px 4px 8px var(--shadow-dark),-4px -4px 8px var(--shadow-light);
          --nm-inset:inset 4px 4px 8px var(--shadow-dark),inset -4px -4px 8px var(--shadow-light);
          --border:rgba(0,0,0,0.06);--card-hover:rgba(0,0,0,0.02);
        }
        *{transition:background-color .25s,color .25s,box-shadow .25s}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:var(--text-muted);border-radius:4px}
        button:focus,input:focus,select:focus,textarea:focus{outline:none}
        select option{background:var(--bg-card);color:var(--text)}
        input::placeholder,textarea::placeholder{color:var(--text-muted)}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        .nm-card{background:var(--bg-card);box-shadow:var(--nm-raised);border-radius:18px;overflow:hidden;transition:box-shadow .2s,transform .2s}
        .nm-card:hover{box-shadow:var(--nm-raised),0 0 0 1px var(--accent)22;transform:translateY(-3px)}
        .nm-btn:hover{box-shadow:var(--nm-inset)!important}
        .r-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px}
        .r-grid-sm{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
        @media(max-width:767px){
          .r-grid{grid-template-columns:repeat(2,1fr);gap:12px}
          .r-grid-sm{grid-template-columns:repeat(2,1fr);gap:10px}
          .hide-mobile{display:none!important}
          .modal-wrap{padding:0!important}
          .modal-inner{border-radius:0!important;max-height:100vh!important;height:100vh;border:none!important}
        }
        @media(max-width:400px){
          .r-grid{grid-template-columns:1fr;gap:10px}
          .r-grid-sm{grid-template-columns:repeat(2,1fr);gap:8px}
        }
      `}</style>

      {/* Mobile backdrop */}
      {isMobile && sidebar && <div onClick={()=>setSidebar(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:499,backdropFilter:"blur(2px)"}}/>}

      {/* Sidebar */}
      <div style={isMobile
        ? {position:"fixed",top:0,left:sidebar?0:-240,height:"100vh",width:230,zIndex:500,background:"var(--bg-sidebar)",borderRight:"1px solid var(--border)",boxShadow:"6px 0 24px rgba(0,0,0,0.4)",transition:"left .28s cubic-bezier(.4,0,.2,1)",display:"flex",flexDirection:"column"}
        : {width:sidebar?230:0,minWidth:sidebar?230:0,background:"var(--bg-sidebar)",borderRight:"1px solid var(--border)",boxShadow:"4px 0 12px var(--shadow-dark)",transition:"width .25s,min-width .25s",overflow:"hidden",flexShrink:0,display:"flex",flexDirection:"column"}}>
        <div style={{padding:"16px 16px 12px",display:"flex",alignItems:"center",gap:10}}>
          <img src="/logo.svg" alt="MealPrepMaster" style={{width:38,height:38,flexShrink:0}}/>
          <div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:700,color:"var(--accent)",whiteSpace:"nowrap",lineHeight:1.2}}>MealPrepMaster</div>
            <div style={{color:"var(--text-muted)",fontSize:11,whiteSpace:"nowrap"}}>{recipes.length} recipes saved</div>
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"0 8px"}}>
          {navItems.map(item=>(
            <button key={item.id} onClick={()=>navTo(item.id)}
              style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,border:"none",cursor:"pointer",marginBottom:4,background:sec===item.id?"var(--bg-card)":"transparent",boxShadow:sec===item.id?"var(--nm-raised-sm)":"none",color:sec===item.id?"var(--accent)":"var(--text-sub)",fontFamily:"inherit",fontSize:13,fontWeight:sec===item.id?600:400,textAlign:"left",whiteSpace:"nowrap",transition:"all .15s"}}>
              <span style={{fontSize:16}}>{item.icon}</span>{item.label}
              {item.id==="favorites"&&favorites.length>0&&<span style={{marginLeft:"auto",background:"var(--accent)",color:"var(--bg)",borderRadius:10,padding:"0 6px",fontSize:10,fontWeight:700}}>{favorites.length}</span>}
            </button>
          ))}

          <div style={{padding:"12px 12px 4px",color:"var(--text-muted)",fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginTop:8}}>Filter by Goal</div>
          {[null,...GOALS].map(g=>(
            <button key={g||"all"} onClick={()=>setGoalF(g)}
              style={{width:"100%",display:"flex",alignItems:"center",padding:"7px 12px",borderRadius:10,border:"none",cursor:"pointer",background:goalF===g&&g?"var(--bg-card)":"transparent",boxShadow:goalF===g&&g?"var(--nm-raised-sm)":"none",color:goalF===g&&g?"var(--accent)":"var(--text-sub)",fontFamily:"inherit",fontSize:12,textAlign:"left",whiteSpace:"nowrap",transition:"all .15s"}}>
              {g||"All goals"}
            </button>
          ))}
        </div>
        <div style={{padding:"10px 16px",borderTop:"1px solid var(--border)",flexShrink:0}}>
          <div style={{color:"var(--text-muted)",fontSize:10,textAlign:"center"}}>
            {anthropicKey ? <span style={{color:"var(--accent)"}}>✓ AI enabled</span> : <span style={{color:"#f08080"}}>⚠ Click ⚙️ to add API key</span>}
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Topbar */}
        <div style={{height:isMobile?52:56,background:"var(--bg-sidebar)",borderBottom:"1px solid var(--border)",boxShadow:"0 4px 12px var(--shadow-dark)",display:"flex",alignItems:"center",padding:isMobile?"0 10px":"0 16px",gap:isMobile?8:12,flexShrink:0,position:"relative",zIndex:100}}>
          <button onClick={()=>setSidebar(s=>!s)} style={{...GB,padding:"6px 10px",fontSize:16,lineHeight:1,flexShrink:0}}>☰</button>
          {!isMobile && <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search recipes or ingredients..."
            style={{...IS,flex:1,maxWidth:380,height:36,padding:"0 12px",fontSize:13}}/>}
          <div style={{flex:1}}/>
          {isMobile && <button onClick={()=>setSearchOpen(s=>!s)} style={{...GB,padding:"6px 10px",fontSize:16,lineHeight:1,background:searchOpen?"var(--nm-input-bg)":"var(--bg-card)"}} title="Search">🔍</button>}
          <button onClick={toggleDark} title={darkMode?"Light mode":"Dark mode"}
            style={{...GB,padding:"6px 10px",fontSize:16,lineHeight:1,flexShrink:0}}>
            {darkMode?"☀️":"🌙"}
          </button>
          <button onClick={()=>setSettingsOpen(s=>!s)} title="API Keys"
            style={{...GB,background:anthropicKey?"rgba(58,125,94,0.25)":"rgba(192,80,80,0.18)",color:anthropicKey?"var(--accent)":"#f08080",padding:"7px 10px",fontSize:isMobile?13:13,flexShrink:0}}>
            {isMobile?(anthropicKey?"⚙️✓":"⚙️!"):(anthropicKey?"⚙️ Keys ✓":"⚙️ Add API Key")}
          </button>
          <button onClick={()=>setAddOpen(true)} style={{background:"linear-gradient(135deg,var(--accent2),var(--accent))",boxShadow:"var(--nm-raised-sm)",border:"none",borderRadius:10,color:"#fff",padding:isMobile?"8px 12px":"8px 16px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0}}>
            {isMobile?"＋":"+ Add Recipe"}
          </button>
        </div>
        {/* Mobile search bar (expandable) */}
        {isMobile && searchOpen && (
          <div style={{background:"var(--bg-sidebar)",padding:"8px 10px",borderBottom:"1px solid var(--border)"}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search recipes or ingredients..." autoFocus
              style={{...IS,height:36,padding:"0 12px",fontSize:14}}/>
          </div>
        )}

        {/* Settings dropdown */}
        {settingsOpen && (
          <div style={{position:"absolute",top:64,right:16,zIndex:200,background:"var(--bg-card)",boxShadow:"var(--nm-raised),0 16px 48px var(--shadow-dark)",borderRadius:18,padding:22,width:310}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <span style={{color:"var(--text)",fontWeight:700,fontSize:14}}>⚙️ API Keys</span>
              <button onClick={()=>setSettingsOpen(false)} style={{...GB,padding:"3px 9px",fontSize:18,lineHeight:1}}>×</button>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{color:"var(--text-sub)",fontSize:11,fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:.8}}>🤖 Anthropic Key <span style={{color:"#f08080"}}>(required for AI)</span></div>
              <input type="password" placeholder="sk-ant-api03-…" value={anthropicKey}
                onChange={e=>{setAnthropicKey(e.target.value);localStorage.setItem('anthropic_key',e.target.value);}}
                onKeyDown={e=>{if(e.key==='Enter') setSettingsOpen(false);}}
                style={{...IS,fontSize:13,marginBottom:8}}/>
              {anthropicKey
                ? <div style={{color:"var(--accent)",fontSize:11}}>✓ AI extraction &amp; image generation enabled</div>
                : <div style={{color:"var(--text-sub)",fontSize:11}}>Get a free key at <span style={{color:"#5a8fd4"}}>console.anthropic.com</span> → API Keys</div>}
            </div>
            <div>
              <div style={{color:"var(--text-sub)",fontSize:11,fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:.8}}>📷 Pexels Key <span style={{color:"var(--text-muted)"}}>(optional, for real photos)</span></div>
              <input type="password" placeholder="Pexels API key…" value={pexelsKey}
                onChange={e=>{setPexelsKey(e.target.value);localStorage.setItem('pexels_key',e.target.value);}}
                onKeyDown={e=>{if(e.key==='Enter') setSettingsOpen(false);}}
                style={{...IS,fontSize:13,marginBottom:8}}/>
              {pexelsKey
                ? <div style={{color:"var(--accent)",fontSize:11}}>✓ Real food photos enabled</div>
                : <div style={{color:"var(--text-sub)",fontSize:11}}>Free at <span style={{color:"#5a8fd4"}}>pexels.com/api</span></div>}
            </div>
          </div>
        )}

        {/* Content */}
        <div style={{flex:1,overflowY:"auto",padding:isMobile?12:24,paddingBottom:isMobile?76:24,background:"var(--bg)"}}>

          {/* Dashboard */}
          {sec==="dashboard" && (
            <div>
              <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",marginBottom:6}}>Dashboard</h2>
              <p style={{color:"var(--text-sub)",fontSize:14,marginBottom:22}}>Your meal prep overview</p>
              <div className="r-grid-sm" style={{marginBottom:28}}>
                {[[recipes.length,"Recipes","📖","#5a8fd4"],[favorites.length,"Favorites","♥","#c06090"],[mealPlanItems.length,"Planned","📅","#5aad8e"],[recipes.filter(r=>(r.tags||[]).some(t=>HEALTH_TAGS.includes(t))).length,"Health","💚","#d4875a"]].map(([v,l,ico,col])=>(
                  <div key={l} style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:16,padding:"18px 16px",cursor:"pointer",transition:"all .2s"}}
                    onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="var(--nm-inset)";}} onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="var(--nm-raised)";}}>
                    <div style={{fontSize:24,marginBottom:8}}>{ico}</div>
                    <div style={{color:col,fontWeight:800,fontSize:28,lineHeight:1}}>{v}</div>
                    <div style={{color:"var(--text-muted)",fontSize:11,marginTop:4,textTransform:"uppercase",letterSpacing:.5}}>{l}</div>
                  </div>
                ))}
              </div>
              {/* Tips Carousel */}
              {(() => {
                const TIPS = ["Start your rice cooker first — it frees up stove space","Chop all vegetables before turning on any heat","Use oven & stovetop simultaneously to halve your prep time","Batch cook proteins on Sundays for the whole week"];
                return (
                  <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:14,padding:"16px 18px",marginBottom:24,display:"flex",alignItems:"center",gap:12,borderLeft:"3px solid var(--accent)"}}>
                    <span style={{fontSize:22,flexShrink:0}}>💡</span>
                    <div style={{flex:1,color:"var(--text)",fontSize:14,lineHeight:1.5}}>{TIPS[tipIdx]}</div>
                    <div style={{display:"flex",gap:6,flexShrink:0}}>
                      <button onClick={()=>setTipIdx(i=>(i-1+TIPS.length)%TIPS.length)} style={{...GB,padding:"4px 10px",fontSize:14}}>‹</button>
                      <span style={{color:"#6a7a90",fontSize:11,alignSelf:"center"}}>{tipIdx+1}/{TIPS.length}</span>
                      <button onClick={()=>setTipIdx(i=>(i+1)%TIPS.length)} style={{...GB,padding:"4px 10px",fontSize:14}}>›</button>
                    </div>
                  </div>
                );
              })()}
              <h3 style={{color:"var(--text)",fontSize:14,fontWeight:700,marginBottom:14}}>Recent Recipes</h3>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:18,marginBottom:28}}>
                {recipes.slice(-4).reverse().map(r=>(
                  <RecipeCard key={r.id} recipe={r} onClick={setViewing} onFavorite={toggleFav} isFavorite={isFav(r)}/>
                ))}
              </div>
              {(() => {
                const suggested = recipes.filter(r=>(r.tags||[]).some(t=>["Anti-Inflammatory","Blood Sugar Stable"].includes(t)));
                if (!suggested.length) return null;
                return (
                  <div style={{marginBottom:28}}>
                    <h3 style={{color:"var(--accent)",fontSize:14,fontWeight:700,marginBottom:4}}>💚 Suggested for You</h3>
                    <p style={{color:"var(--text-sub)",fontSize:12,marginBottom:14}}>Anti-inflammatory &amp; blood sugar-stabilizing meals</p>
                    <div className="r-grid">
                      {suggested.slice(0,4).map(r=>(
                        <RecipeCard key={r.id} recipe={r} onClick={setViewing} onFavorite={toggleFav} isFavorite={isFav(r)}/>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {recipes.length===0 && (
                <div style={{textAlign:"center",padding:"48px 0",color:"#5a6a7a"}}>
                  <div style={{fontSize:40,marginBottom:12}}>🥗</div>
                  <div style={{fontSize:15,color:"#8a9bb0",marginBottom:8}}>No recipes yet</div>
                  <button onClick={()=>setAddOpen(true)} style={{background:"linear-gradient(135deg,#3a7d5e,#5aad8e)",border:"none",borderRadius:10,color:"#fff",padding:"10px 20px",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Add your first recipe</button>
                </div>
              )}
            </div>
          )}

          {/* Recipes */}
          {sec==="recipes" && (
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
                <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",margin:0}}>All Recipes</h2>
                <button onClick={()=>setAddOpen(true)} style={{background:"linear-gradient(135deg,#3a7d5e,#5aad8e)",border:"none",borderRadius:9,color:"#fff",padding:"8px 16px",fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:13}}>+ Add Recipe</button>
              </div>

              {/* Category filter */}
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
                {CATEGORIES.map(c=>(
                  <button key={c.id} onClick={()=>setCatF(c.id)}
                    style={{...CB,boxShadow:catF===c.id?"var(--nm-inset)":"var(--nm-raised-sm)",color:catF===c.id?"var(--accent)":"var(--text-sub)",padding:"6px 14px"}}>
                    {c.icon} {c.label}
                  </button>
                ))}
              </div>

              {/* Diet tag filter */}
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
                {DIET_TAGS.map(t=>(
                  <button key={t} onClick={()=>setTagF(tagF===t?null:t)}
                    style={{...CB,boxShadow:tagF===t?"var(--nm-inset)":"var(--nm-raised-sm)",color:tagF===t?(TAG_COLORS[t]||"var(--accent)"):"var(--text-sub)"}}>
                    {t}
                  </button>
                ))}
              </div>

              {/* Health tag filter */}
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:18}}>
                {HEALTH_TAGS.map(t=>(
                  <button key={t} onClick={()=>setHealthF(healthF===t?null:t)}
                    style={{...CB,boxShadow:healthF===t?"var(--nm-inset)":"var(--nm-raised-sm)",color:healthF===t?(HEALTH_COLORS[t]||"var(--accent)"):"var(--text-sub)"}}>
                    {t}
                  </button>
                ))}
              </div>

              {filtered.length===0
                ? <div style={{textAlign:"center",padding:"48px 0",color:"#5a6a7a"}}><div style={{fontSize:36,marginBottom:10}}>🔍</div><div>No recipes match your filters</div></div>
                : <div className="r-grid">
                    {filtered.map(r=><RecipeCard key={r.id} recipe={r} onClick={setViewing} onFavorite={toggleFav} isFavorite={isFav(r)}/>)}
                  </div>
              }
            </div>
          )}

          {sec==="mix-match" && <MixMatch recipes={recipes} onAddToMealPlan={item=>setMealPlanItems(p=>[...p,item])} onSaveAsRecipe={r=>setRecipes(p=>[...p,r])}/>}

          {sec==="meal-plan" && <MealPlanManager recipes={recipes} mealPlanItems={mealPlanItems} setMealPlanItems={setMealPlanItems}/>}

          {sec==="optimizer" && <MealPrepOptimizer recipes={recipes} onAddToMealPlan={item=>setMealPlanItems(p=>[...p,item])}/>}

          {sec==="ingredient-search" && <IngredientSearch recipes={recipes} onView={setViewing}/>}

          {sec==="favorites" && <FavoritesView favorites={favorites} recipes={recipes} setFavorites={setFavorites} onView={setViewing}/>}
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      {isMobile && (
        <div style={{position:"fixed",bottom:0,left:0,right:0,height:60,background:"var(--bg-sidebar)",borderTop:"1px solid var(--border)",display:"flex",zIndex:400,boxShadow:"0 -4px 16px var(--shadow-dark)"}}>
          {navItems.slice(0,5).map(item=>(
            <button key={item.id} onClick={()=>navTo(item.id)}
              style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,border:"none",background:"transparent",color:sec===item.id?"var(--accent)":"var(--text-muted)",cursor:"pointer",fontFamily:"inherit",padding:"4px 0",position:"relative"}}>
              <span style={{fontSize:20,lineHeight:1}}>{item.icon}</span>
              <span style={{fontSize:9,fontWeight:sec===item.id?700:400,letterSpacing:.3}}>{item.label}</span>
              {item.id==="favorites"&&favorites.length>0&&<span style={{position:"absolute",top:4,right:"calc(50% - 18px)",background:"var(--accent)",color:"var(--bg)",borderRadius:8,padding:"0 4px",fontSize:9,fontWeight:700,lineHeight:1.6}}>{favorites.length}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Modals */}
      {viewing && (
        <RecipeDetail
          recipe={viewing} onClose={()=>setViewing(null)}
          onFavorite={toggleFav} isFavorite={isFav(viewing)}
          onRate={r=>setRatingTarget(r)} ratings={ratings}/>
      )}
      {addOpen && <SmartAddModal onClose={()=>setAddOpen(false)} onAdd={r=>setRecipes(p=>[...p,r])}/>}
      {ratingTarget && <RatingModal recipe={ratingTarget} existing={ratings[ratingTarget.id]} onSave={(id,r)=>setRatings(p=>({...p,[id]:r}))} onClose={()=>setRatingTarget(null)}/>}
    </div>
  );
}
