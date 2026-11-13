/**
 * Canonical category taxonomy - ported from UcsExtractor
 * `packages/shared/src/taxonomy.ts`.
 *
 * One internal id per category, with the free-text handles used to match a
 * captured page label onto it. This is what makes "dentist" mean the same
 * thing whether it came from a captured page, OSM, or a future paid provider.
 *
 * Seed size is intentionally ~48 high-value categories, not an exhaustive tree.
 */
export const CATEGORIES = [
  { id: 'restaurant', label: 'Restaurant', keywords: ['restaurant', 'dining', 'eatery'] },
  { id: 'fast_food', label: 'Fast food', keywords: ['fast food', 'takeaway', 'qsr'] },
  { id: 'cafe', label: 'Cafe', keywords: ['cafe', 'coffee shop'] },
  { id: 'bakery', label: 'Bakery', keywords: ['bakery', 'bakers'] },
  { id: 'bar', label: 'Bar / pub', keywords: ['bar', 'pub', 'lounge'] },
  { id: 'hotel', label: 'Hotel', keywords: ['hotel', 'resort'] },
  { id: 'guest_house', label: 'Guest house', keywords: ['guest house', 'lodge'] },
  { id: 'hospital', label: 'Hospital', keywords: ['hospital', 'multispeciality'] },
  { id: 'clinic', label: 'Clinic', keywords: ['clinic', 'polyclinic'] },
  { id: 'dentist', label: 'Dentist', keywords: ['dentist', 'dental'] },
  { id: 'pharmacy', label: 'Pharmacy', keywords: ['pharmacy', 'chemist', 'medical store'] },
  { id: 'diagnostics', label: 'Diagnostics lab', keywords: ['diagnostic', 'pathology', 'lab'] },
  { id: 'school', label: 'School', keywords: ['school', 'vidyalaya'] },
  { id: 'college', label: 'College', keywords: ['college', 'institute'] },
  { id: 'coaching', label: 'Coaching centre', keywords: ['coaching', 'tuition', 'classes'] },
  { id: 'gym', label: 'Gym / fitness', keywords: ['gym', 'fitness'] },
  { id: 'beauty_salon', label: 'Beauty salon', keywords: ['salon', 'beauty parlour', 'parlor'] },
  { id: 'spa', label: 'Spa', keywords: ['spa', 'wellness'] },
  { id: 'supermarket', label: 'Supermarket', keywords: ['supermarket', 'departmental store'] },
  { id: 'convenience', label: 'Convenience store', keywords: ['kirana', 'general store'] },
  { id: 'clothing', label: 'Clothing store', keywords: ['clothing', 'boutique', 'apparel'] },
  { id: 'electronics', label: 'Electronics store', keywords: ['electronics', 'appliance'] },
  { id: 'mobile_shop', label: 'Mobile phone shop', keywords: ['mobile shop', 'mobile phone'] },
  { id: 'computer_repair', label: 'Computer repair', keywords: ['computer repair', 'laptop repair'] },
  { id: 'hardware', label: 'Hardware store', keywords: ['hardware', 'building material'] },
  { id: 'furniture', label: 'Furniture store', keywords: ['furniture'] },
  { id: 'jewellery', label: 'Jewellery store', keywords: ['jewellery', 'jewelry', 'jewellers'] },
  { id: 'book_store', label: 'Book store', keywords: ['book store', 'books'] },
  { id: 'car_repair', label: 'Car repair', keywords: ['car repair', 'garage', 'service centre'] },
  { id: 'car_dealer', label: 'Car dealer', keywords: ['car dealer', 'showroom'] },
  { id: 'petrol_station', label: 'Petrol station', keywords: ['petrol pump', 'fuel station'] },
  { id: 'bank', label: 'Bank', keywords: ['bank', 'branch'] },
  { id: 'atm', label: 'ATM', keywords: ['atm'] },
  { id: 'real_estate', label: 'Real estate', keywords: ['real estate', 'property dealer', 'realtor'] },
  { id: 'travel_agency', label: 'Travel agency', keywords: ['travel agency', 'tour operator'] },
  { id: 'courier', label: 'Courier', keywords: ['courier', 'parcel'] },
  { id: 'laundry', label: 'Laundry', keywords: ['laundry', 'dry cleaning'] },
  { id: 'printing', label: 'Printing / copy', keywords: ['printing', 'xerox', 'copyshop'] },
  { id: 'photography', label: 'Photography', keywords: ['photography', 'photo studio'] },
  { id: 'catering', label: 'Catering', keywords: ['catering', 'caterer'] },
  { id: 'event_venue', label: 'Event venue', keywords: ['banquet', 'event venue', 'marriage hall'] },
  { id: 'it_services', label: 'IT services', keywords: ['it services', 'software company'] },
  { id: 'accounting', label: 'Accounting', keywords: ['chartered accountant', 'accounting', 'ca firm'] },
  { id: 'legal', label: 'Legal services', keywords: ['advocate', 'lawyer', 'legal'] },
  { id: 'architecture', label: 'Architecture', keywords: ['architect', 'architecture firm'] },
  { id: 'logistics', label: 'Logistics', keywords: ['logistics', 'transport', 'freight'] },
  { id: 'manufacturing', label: 'Manufacturing', keywords: ['manufacturing', 'factory', 'plant'] },
  { id: 'wholesale', label: 'Wholesale', keywords: ['wholesale', 'distributor', 'supplier'] },
];

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((category) => [category.id, category]));

/**
 * Best-effort match of a provider/page label onto a canonical category.
 * Returns null rather than guessing a wrong category.
 */
export function matchCategory(label) {
  if (!label) return null;
  const needle = String(label).toLowerCase().trim();
  if (!needle) return null;

  let best = null;

  for (const category of CATEGORIES) {
    for (const keyword of category.keywords) {
      let score = 0;
      if (needle === keyword) score = 100;
      else if (needle.includes(keyword)) score = 60 + keyword.length;
      else if (keyword.includes(needle) && needle.length >= 4) score = 40 + needle.length;
      if (score > 0 && (!best || score > best.score)) {
        best = { category, score };
      }
    }
  }

  return best ? best.category : null;
}
