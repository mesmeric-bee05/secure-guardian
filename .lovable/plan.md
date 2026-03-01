

# Plan: Update Remaining Protocol Categories with Specific Reference Books

## Verification Results

**Protocol Cards (Home Page):** Verified working correctly. The Heart Attack protocol modal displays:
- Embedded YouTube CPR tutorial video
- Steps to Follow with numbered instructions
- Red Flags and When to Go to Hospital sections
- Category-specific reference books (Where There Is No Doctor, CPR/AED Handbook, AHA Guidelines)
- Read Aloud and Call Emergency buttons

**Reports Page:** Route and code confirmed working. Requires CHW/Admin authentication, which is correctly enforced. The page includes 30-day trend charts, status distribution pie chart, priority bar chart, top symptoms, and CHW performance table -- all rendering with Recharts.

## Data Update: Remaining Protocol Categories

Seven categories still have generic "First Aid Manual" by DK/Red Cross as their second book. Each will be updated with curated, condition-specific references:

### 1. Allergic Reactions
- Keep: Where There Is No Doctor
- Add: *Anaphylaxis in Schools & Other Settings* (ACAAI) and *Emergency Medicine Manual* (Tintinalli)
- Video already set: https://www.youtube.com/watch?v=CH7lMxOuIHg

### 2. Drowning
- Keep: Where There Is No Doctor
- Add: *Drowning Prevention and Rescue* (Royal Life Saving) and *Lifeguarding Manual* (American Red Cross)
- Video already set: https://www.youtube.com/watch?v=FHfbSjRDlvE

### 3. Electrical Shock
- Keep: Where There Is No Doctor
- Add: *Electrical Injuries: Medical and Bioengineering Aspects* (Cambridge) and *Emergency Care in the Streets* (AAOS)
- Video already set: https://www.youtube.com/watch?v=rN9ms0ygGB0

### 4. Heatstroke
- Keep: Where There Is No Doctor
- Add: *Wilderness Medicine* (Paul Auerbach) and *Heat Stroke: A Clinical Guide* (Springer)
- Video already set: https://www.youtube.com/watch?v=NJ1YCnbV0qU

### 5. Poisoning
- Keep: Where There Is No Doctor
- Add: *Goldfrank's Toxicologic Emergencies* (McGraw-Hill) and *Poisoning & Drug Overdose* (Olson)
- Video already set: https://www.youtube.com/watch?v=FPrMnVJoiWQ

### 6. Seizure
- Keep: Where There Is No Doctor
- Add: *Epilepsy: A Comprehensive Textbook* (Lippincott) and *Seizure First Aid* (Epilepsy Foundation)
- Video already set: https://www.youtube.com/watch?v=Ovsw7tdneqE

### 7. Snakebite
- Keep: Where There Is No Doctor
- Add: *Snakebites in Africa* (WHO Guidelines) and *Venomous Snakes and Snakebite in East Africa* (Spawls)
- Video already set: https://www.youtube.com/watch?v=bxR-2jMe1HA

## Technical Details

Each category update is a single SQL `UPDATE` statement targeting the `reference_books` JSONB column on `first_aid_protocols`, filtered by `category`. Seven total updates will be executed via the data insert tool. No schema changes or code modifications are required -- the existing `ProtocolDetailModal` component already renders `reference_books` correctly.

