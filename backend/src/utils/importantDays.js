// Fixed international / UN observance days for the "Important Days" calendar.
// A separate, deterministic source from Calendarific: these are hardcoded
// month/day rules, so they render for ANY year with zero API calls, and they
// ship in the deploy (the server does not need to reach Calendarific for them).
//
// COVERAGE CONTRACT — read this before editing:
//  • This list is the "never miss a day" guarantee. It is kept comprehensive
//    (UN international days plus globally observed days), so the planner still
//    shows the correct calendar even when Calendarific is unreachable or the
//    API key is missing — it NEVER depends on the upstream for these days.
//  • Every date below is a fixed month/day rule (same day every year). Days
//    that move by weekday (Mother's Day, etc.) live in observances.js
//    WEEKDAY_RULES instead.
//  • Overlaps with identical date+name in observances.js are dropped at merge
//    time (curated wins), which is why a day that already exists in the curated
//    file can appear here too without ever showing twice.
//  • Do NOT add a fixed rule here when the curated file carries the SAME concept
//    on a WRONG date — fix the curated row instead (see observances.js), then
//    add it here so the synonym collapses into the corrected curated row.

const INTERNATIONAL_DAYS = [
  /* January */
  { m: 1, d: 1, name: "New Year's Day", themes: ['community'] },
  { m: 1, d: 4, name: 'World Braille Day', themes: ['education', 'disability'] },
  { m: 1, d: 10, name: 'World Hindi Day', themes: ['education'] },
  { m: 1, d: 26, name: 'International Customs Day', themes: ['livelihoods'] },
  { m: 1, d: 28, name: 'International Data Protection Day', themes: ['technology', 'rights'] },

  /* February */
  { m: 2, d: 4, name: 'International Day of Human Fraternity', themes: ['rights', 'community'] },
  { m: 2, d: 10, name: 'World Pulses Day', themes: ['nutrition', 'livelihoods', 'environment'] },
  { m: 2, d: 21, name: 'International Mother Language Day', themes: ['education'] },
  { m: 2, d: 27, name: 'World NGO Day', themes: ['community'] },

  /* March */
  { m: 3, d: 3, name: 'World Hearing Day', themes: ['health', 'disability'] },
  { m: 3, d: 4, name: 'World Engineering Day for Sustainable Development', themes: ['technology', 'education'] },
  { m: 3, d: 5, name: 'International Day for Disarmament and Non-Proliferation Awareness', themes: ['rights'] },
  { m: 3, d: 15, name: 'International Day to Combat Islamophobia', themes: ['rights', 'social-inclusion'] },
  { m: 3, d: 20, name: 'International Day of Happiness', themes: ['community', 'health'] },
  { m: 3, d: 21, name: 'International Day for the Elimination of Racial Discrimination', themes: ['rights', 'social-inclusion'] },
  { m: 3, d: 24, name: 'International Day for the Right to the Truth concerning Gross Human Rights Violations and for the Dignity of Victims', themes: ['rights'] },
  { m: 3, d: 25, name: 'International Day of Remembrance of the Victims of Slavery and the Transatlantic Slave Trade', themes: ['rights', 'education'] },
  { m: 3, d: 27, name: 'World Theatre Day', themes: ['sports-culture', 'education'] },

  /* April */
  { m: 4, d: 2, name: "International Children's Book Day", themes: ['education', 'children'] },
  { m: 4, d: 4, name: 'International Day for Mine Awareness and Assistance in Mine Action', themes: ['rights', 'social-inclusion'] },
  { m: 4, d: 6, name: 'International Day of Sport for Development and Peace', themes: ['sports-culture', 'community'] },
  { m: 4, d: 7, name: 'International Day of Reflection on the 1994 Genocide against the Tutsi in Rwanda', themes: ['rights'] },
  { m: 4, d: 12, name: 'International Day of Human Space Flight', themes: ['education', 'technology'] },
  { m: 4, d: 18, name: 'International Day for Monuments and Sites', themes: ['sports-culture', 'education'] },
  { m: 4, d: 23, name: 'English Language Day', themes: ['education'] },
  { m: 4, d: 24, name: 'International Day of Multilateralism and Diplomacy for Peace', themes: ['rights', 'community'] },
  { m: 4, d: 26, name: 'World Intellectual Property Day', themes: ['education', 'technology', 'livelihoods'] },

  /* May */
  { m: 5, d: 1, name: "International Workers' Day", themes: ['livelihoods', 'rights'] },
  { m: 5, d: 5, name: 'World Hand Hygiene Day', themes: ['health'] },
  { m: 5, d: 5, name: 'International Day of the Midwife', themes: ['health', 'women-children'] },
  { m: 5, d: 8, name: 'World Thalassaemia Day', themes: ['health'] },
  { m: 5, d: 12, name: 'International Day of Plant Health', themes: ['environment', 'nutrition'] },
  { m: 5, d: 16, name: 'International Day of Living Together in Peace', themes: ['community', 'rights'] },
  { m: 5, d: 17, name: 'World Telecommunication and Information Society Day', themes: ['technology', 'education'] },
  { m: 5, d: 20, name: 'World Metrology Day', themes: ['technology'] },
  { m: 5, d: 21, name: 'World Day for Cultural Diversity for Dialogue and Development', themes: ['education', 'community'] },
  { m: 5, d: 23, name: 'International Day for the Eradication of Obstetric Fistula', themes: ['women-children', 'health'] },
  { m: 5, d: 25, name: "International Missing Children's Day", themes: ['children', 'rights'] },
  { m: 5, d: 29, name: 'International Day of UN Peacekeepers', themes: ['rights', 'community'] },
  { m: 5, d: 31, name: 'World No Tobacco Day', themes: ['health'] },

  /* June */
  { m: 6, d: 1, name: "International Children's Day", themes: ['children', 'rights'] },
  { m: 6, d: 1, name: 'World Milk Day', themes: ['nutrition'] },
  { m: 6, d: 1, name: 'International Day of Innocent Children Victims of Aggression', themes: ['children', 'rights'] },
  { m: 6, d: 5, name: 'International Day against Illegal, Unreported and Unregulated Fishing', themes: ['environment', 'livelihoods'] },
  { m: 6, d: 13, name: 'International Albinism Awareness Day', themes: ['rights', 'disability', 'health'] },
  { m: 6, d: 23, name: "International Widows' Day", themes: ['women-children', 'rights', 'social-inclusion'] },
  { m: 6, d: 26, name: 'International Day against Drug Abuse and Illicit Trafficking', themes: ['health', 'youth'] },
  { m: 6, d: 30, name: 'International Asteroid Day', themes: ['technology', 'education'] },

  /* July */
  { m: 7, d: 15, name: 'World Youth Skills Day', themes: ['youth', 'livelihoods', 'education'] },
  { m: 7, d: 17, name: 'World Day for International Justice', themes: ['rights'] },
  { m: 7, d: 20, name: 'World Chess Day', themes: ['sports-culture', 'education'] },
  { m: 7, d: 26, name: 'International Day for the Conservation of the Mangrove Ecosystem', themes: ['environment'] },
  { m: 7, d: 30, name: 'International Day of Friendship', themes: ['community', 'social-inclusion'] },

  /* August */
  { m: 8, d: 9, name: "International Day of the World's Indigenous Peoples", themes: ['rights', 'social-inclusion'] },
  { m: 8, d: 20, name: 'World Mosquito Day', themes: ['health'] },
  { m: 8, d: 23, name: 'International Day for the Remembrance of the Slave Trade', themes: ['rights', 'education'] },
  { m: 8, d: 30, name: 'International Day of the Victims of Enforced Disappearances', themes: ['rights'] },
  { m: 8, d: 31, name: 'International Day for People of African Descent', themes: ['rights', 'social-inclusion'] },

  /* September */
  { m: 9, d: 8, name: 'World Physical Therapy Day', themes: ['health', 'disability'] },
  { m: 9, d: 15, name: 'International Day of Democracy', themes: ['rights', 'community'] },
  { m: 9, d: 21, name: "World Alzheimer's Day", themes: ['health', 'disability'] },
  { m: 9, d: 26, name: 'International Day for the Total Elimination of Nuclear Weapons', themes: ['rights'] },
  { m: 9, d: 27, name: 'World Tourism Day', themes: ['sports-culture', 'livelihoods', 'community'] },
  { m: 9, d: 28, name: 'International Right to Know Day', themes: ['rights', 'education'] },
  { m: 9, d: 29, name: 'World Heart Day', themes: ['health'] },
  { m: 9, d: 29, name: 'International Day of Awareness of Food Loss and Waste', themes: ['nutrition', 'environment'] },

  /* October — includes the "always show" anchor list (World Food Day, World
     Mental Health Day and UN Day live in observances.js, so these merge in as
     dedupes only when the curated file already carries them). */
  { m: 10, d: 1, name: 'International Day of Older Persons', themes: ['social-inclusion', 'health'] },
  { m: 10, d: 4, name: 'World Animal Day', themes: ['environment'] },
  { m: 10, d: 10, name: 'World Mental Health Day', themes: ['health'] },
  { m: 10, d: 13, name: 'International Day for Disaster Risk Reduction', themes: ['community', 'health'] },
  { m: 10, d: 15, name: 'Global Handwashing Day', themes: ['health', 'nutrition'] },
  { m: 10, d: 15, name: 'International Day of Rural Women', themes: ['women-children', 'livelihoods'] },
  { m: 10, d: 16, name: 'World Food Day', themes: ['nutrition', 'livelihoods'] },
  { m: 10, d: 17, name: 'International Day for the Eradication of Poverty', themes: ['social-inclusion', 'rights', 'livelihoods'] },
  { m: 10, d: 24, name: 'United Nations Day', themes: ['rights', 'community'] },
  { m: 10, d: 24, name: 'World Polio Day', themes: ['health'] },
  { m: 10, d: 31, name: 'World Cities Day', themes: ['community', 'environment'] },

  /* November */
  { m: 11, d: 6, name: 'International Day for Preventing the Exploitation of the Environment in War and Armed Conflict', themes: ['environment', 'rights'] },
  { m: 11, d: 10, name: 'World Science Day for Peace and Development', themes: ['education', 'technology'] },
  { m: 11, d: 16, name: 'International Day for Tolerance', themes: ['rights', 'social-inclusion'] },
  { m: 11, d: 17, name: 'World Prematurity Day', themes: ['health'] },
  { m: 11, d: 20, name: "World Children's Day", themes: ['children', 'rights', 'education'] },
  { m: 11, d: 21, name: 'World Television Day', themes: ['technology', 'education', 'community'] },
  { m: 11, d: 21, name: 'World Philosophy Day', themes: ['education'] },

  /* December */
  { m: 12, d: 7, name: 'International Civil Aviation Day', themes: ['technology', 'education'] },
  { m: 12, d: 9, name: 'International Anti-Corruption Day', themes: ['rights', 'community'] },
  { m: 12, d: 11, name: 'International Mountain Day', themes: ['environment', 'livelihoods'] },
  { m: 12, d: 18, name: 'International Migrants Day', themes: ['rights', 'social-inclusion'] },
];

const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * Every fixed international day whose date falls inside [startYmd, endYmd)
 * (endYmd exclusive). Deterministic and independent of any API.
 */
export function getInternationalDaysInRange(startYmd, endYmd) {
  const out = [];
  const startDate = new Date(`${startYmd}T00:00:00Z`);
  const endDate = new Date(`${endYmd}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) return out;

  const startYear = startDate.getUTCFullYear();
  const endYear = endDate.getUTCFullYear();
  for (let y = startYear; y <= endYear; y++) {
    for (const row of INTERNATIONAL_DAYS) {
      const date = ymd(y, row.m, row.d);
      if (date >= startYmd && date < endYmd) {
        out.push({
          date,
          name: row.name,
          scope: 'worldwide',
          kind: 'observance',
          precision: 'fixed',
          type: 'international',
          source: 'international',
          themes: Array.isArray(row.themes) ? row.themes : [],
          note: row.note || null,
        });
      }
    }
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name)));
  return out;
}