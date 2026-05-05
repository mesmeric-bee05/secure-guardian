# Plan: Expand Protocol Library + End-to-End Verification

## 1. Add 4 New Bilingual First Aid Protocols

Insert into `first_aid_protocols` table with full English/Swahili content, validated `video_url`, and curated `reference_books` JSON:

1. **Jellyfish Stings** (category: `marine`, severity: `high`)
   - Steps: get out of water, rinse with vinegar/seawater (not fresh water), remove tentacles with tweezers, hot water immersion 40-45°C for 20-40 min, pain relief
   - Red flags: difficulty breathing, chest pain, multiple stings, child/elderly victim

2. **Heat Cramps** (category: `environmental`, severity: `medium`)
   - Steps: stop activity, move to cool area, gentle stretching, oral rehydration with electrolytes, rest 1+ hours before resuming activity
   - Red flags: cramps lasting >1 hour, nausea, signs of heat exhaustion progression

3. **Lightning Strike First Aid** (category: `environmental`, severity: `critical`)
   - Steps: ensure scene safety, call 999, check ABC, start CPR if no pulse (lightning victims have high CPR success), treat for shock, look for entry/exit burns, immobilize spine
   - Red flags: cardiac arrest, unconsciousness, burns, paralysis, multiple victims (triage reverse — treat "dead" first)

4. **Chemical Burns** (category: `burns`, severity: `high`)
   - Steps: PPE/avoid contact, brush off dry chemicals first, flush with copious cool running water 20+ min, remove contaminated clothing/jewelry, cover loosely with sterile gauze, identify chemical for hospital
   - Red flags: eye exposure, inhalation, large surface area, unknown chemical, signs of shock

Each entry includes:
- `video_url` — verified YouTube training resource (St John Ambulance, Red Cross, etc.)
- `reference_books` — JSONB array with 2-3 entries (e.g., "Where There Is No Doctor", "First Aid Manual" by DK/British Red Cross, ACEP First Aid Manual)

Insert via the database insert tool (data operation, not schema change). Total protocols will become 48.

## 2. Browser Verification (4 flows)

After inserting, run live browser checks:

**Flow A — Home → Food Poisoning protocol**
- Navigate to `/`, scroll to First Aid Protocols, click "View All Protocols", open "Food Poisoning"
- Verify: title, content, steps, video preview card with thumbnail + "Watch Demo" external link, reference books list

**Flow B — Home → New protocols**
- Open one of the 4 new protocols (e.g., Lightning Strike) to confirm video + books render

**Flow C — /chat AI response**
- Navigate to `/chat`, sign in if needed, send test message ("What should I do for a burn?"), confirm streamed AI response renders as markdown

**Flow D — /admin Analytics tab**
- Navigate to `/admin`, click Analytics tab, verify summary cards, charts, and system health indicators render

## 3. Security & Error Handling
- Run security scan after data insertion to confirm no new findings
- Check console + network tabs for errors during each flow; fix any issues found

## Technical Details
- Data insertion uses `INSERT` statements via the insert tool (not migration — no schema change)
- All `reference_books` entries use `{title, author, url, isbn?}` JSON shape consumed by `ProtocolDetailModal`
- All `video_url` entries use canonical `youtube.com/watch?v=...` URLs parsed by `ProtocolVideoResource.getYouTubeVideoId`
- Categories `marine` and `environmental` will fall through to the default icon/color in `FirstAidProtocols.tsx` (acceptable — existing pattern)
