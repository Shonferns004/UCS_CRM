export const METRO_COLORS = {
  'line-1': '#1755c4',
  'line-2a': '#f7a800',
  'line-2b': '#f7a800',
  'line-3': '#00a0a7',
  'line-7': '#e0241f',
  'line-9': '#e0241f'
}

export const DISPLAY_LINE_IDS = ['line-2a', 'line-2b', 'line-7', 'line-9']

export const metroLines = [
  {
    id: 'line-1',
    number: '1',
    name: 'Blue Line',
    longName: 'Versova – Ghatkopar',
    color: METRO_COLORS['line-1'],
    status: 'OPERATIONAL',
    stations: [
      'versova',
      'dn-nagar',
      'azad-nagar',
      'andheri',
      'western-express-highway',
      'chakala',
      'airport-road',
      'marol-naka',
      'saki-naka',
      'asalpha',
      'jagruti-nagar',
      'ghatkopar'
    ]
  },
  {
    id: 'line-2a',
    number: '2A',
    name: 'Yellow Line',
    longName: 'Dahisar East – Andheri West',
    color: METRO_COLORS['line-2a'],
    status: 'OPERATIONAL',
    stations: [
      'dahisar-east',
      'anand-nagar',
      'kandarpada',
      'mandapeshwar',
      'eksar',
      'borivali-west',
      'shimpoli',
      'kandivli-west',
      'dahanukarwadi',
      'valnai-meeth-chowky',
      'malad-west',
      'lower-malad',
      'bangur-nagar',
      'goregaon-west',
      'oshiwara',
      'lower-oshiwara',
      'andheri-west'
    ]
  },
  {
    id: 'line-2b',
    number: '2B',
    name: 'Yellow Line',
    longName: 'Chembur – Mandale',
    color: METRO_COLORS['line-2b'],
    status: 'PARTIALLY_OPERATIONAL',
    stations: [
      'chembur',
      'diamond-garden',
      'csm-chowk',
      'shivaji-chowk',
      'deonar',
      'mankhurd',
      'mandale'
    ]
  },
  {
    id: 'line-3',
    number: '3',
    name: 'Aqua Line',
    longName: 'Aarey JVLR – Cuffe Parade',
    color: METRO_COLORS['line-3'],
    status: 'OPERATIONAL',
    stations: [
      'aarey-jvlr',
      'seepz',
      'midc-andheri',
      'marol-naka',
      'csia-t2',
      'sahar-road',
      'csia-t1',
      'santacruz',
      'bandra-colony',
      'bkc',
      'dharavi',
      'shitaladevi-mandir',
      'dadar',
      'siddhivinayak',
      'worli',
      'acharya-atre-chowk',
      'science-centre',
      'mahalaxmi',
      'jagannath-shankar-sheth',
      'grant-road',
      'girgaon',
      'kalbadevi',
      'csmt',
      'hutatma-chowk',
      'churchgate',
      'vidhan-bhavan',
      'cuffe-parade'
    ]
  },
  {
    id: 'line-7',
    number: '7',
    name: 'Red Line',
    longName: 'Gundavali – Dahisar East',
    color: METRO_COLORS['line-7'],
    status: 'OPERATIONAL',
    stations: [
      'gundavali',
      'mogra',
      'jogeshwari-east',
      'goregaon-east',
      'aarey',
      'dindoshi',
      'kurar',
      'akurli',
      'poisar',
      'magathane',
      'devipada',
      'rashtriya-udyan',
      'ovaripada',
      'dahisar-east'
    ]
  },
  {
    id: 'line-9',
    number: '9',
    name: 'Red Line',
    longName: 'Kashigaon – Dahisar East',
    color: METRO_COLORS['line-9'],
    status: 'PARTIALLY_OPERATIONAL',
    stations: [
      'kashigaon',
      'miragaon',
      'pandurang-wadi',
      'dahisar-east'
    ]
  }
]

export const metroStations = {
  'versova': {
    id: 'versova',
    name: 'Versova',
    aliases: [],
    lat: 19.13027778,
    lng: 72.82138889,
    lines: ['line-1'],
    interchange: false,
    connections: ['Western Railway (Versova)']
  },
  'dn-nagar': {
    id: 'dn-nagar',
    name: 'D.N. Nagar',
    aliases: ['DN Nagar', 'D N Nagar', 'D.N. Nagar Road'],
    lat: 19.12805556,
    lng: 72.83027778,
    lines: ['line-1', 'line-2a'],
    interchange: true
  },
  'azad-nagar': {
    id: 'azad-nagar',
    name: 'Azad Nagar',
    aliases: [],
    lat: 19.1269,
    lng: 72.8378,
    lines: ['line-1'],
    interchange: false
  },
  'andheri': {
    id: 'andheri',
    name: 'Andheri',
    aliases: ['Andheri Metro'],
    lat: 19.1205638,
    lng: 72.8488433,
    lines: ['line-1'],
    interchange: false,
    connections: ['Western Railway (Andheri)']
  },
  'western-express-highway': {
    id: 'western-express-highway',
    name: 'Western Express Highway',
    aliases: ['WEH', 'Western Express Hwy'],
    lat: 19.11555556,
    lng: 72.85638889,
    lines: ['line-1'],
    interchange: true
  },
  'chakala': {
    id: 'chakala',
    name: 'Chakala (J.B. Nagar)',
    aliases: ['Chakala', 'J.B. Nagar'],
    lat: 19.112045,
    lng: 72.867696,
    lines: ['line-1'],
    interchange: false
  },
  'airport-road': {
    id: 'airport-road',
    name: 'Airport Road',
    aliases: [],
    lat: 19.11027,
    lng: 72.87475,
    lines: ['line-1'],
    interchange: false
  },
  'marol-naka': {
    id: 'marol-naka',
    name: 'Marol Naka',
    aliases: [],
    lat: 19.1085041,
    lng: 72.878578,
    lines: ['line-1', 'line-3'],
    interchange: true
  },
  'saki-naka': {
    id: 'saki-naka',
    name: 'Saki Naka',
    aliases: ['Saki Naka Signal'],
    lat: 19.103528,
    lng: 72.887962,
    lines: ['line-1'],
    interchange: false
  },
  'asalpha': {
    id: 'asalpha',
    name: 'Asalpha',
    aliases: ['Asalpha Village'],
    lat: 19.092544,
    lng: 72.901887,
    lines: ['line-1'],
    interchange: false
  },
  'jagruti-nagar': {
    id: 'jagruti-nagar',
    name: 'Jagruti Nagar',
    aliases: ['Jagruti Nagar Signal'],
    lat: 19.092582,
    lng: 72.901866,
    lines: ['line-1'],
    interchange: false
  },
  'ghatkopar': {
    id: 'ghatkopar',
    name: 'Ghatkopar',
    aliases: [],
    lat: 19.08666111,
    lng: 72.90798889,
    lines: ['line-1'],
    interchange: false,
    connections: ['Central Railway (Ghatkopar)']
  },
  'dahisar-east': {
    id: 'dahisar-east',
    name: 'Dahisar East',
    aliases: ['Dahisar (East)'],
    lat: 19.25128,
    lng: 72.86715,
    lines: ['line-2a', 'line-7', 'line-9'],
    interchange: true
  },
  'anand-nagar': {
    id: 'anand-nagar',
    name: 'Anand Nagar',
    aliases: ['Anandnagar'],
    lat: 19.2572087,
    lng: 72.8663486,
    lines: ['line-2a'],
    interchange: false
  },
  'kandarpada': {
    id: 'kandarpada',
    name: 'Kandarpada',
    aliases: [],
    lat: 19.2566337,
    lng: 72.850504,
    lines: ['line-2a'],
    interchange: false
  },
  'mandapeshwar': {
    id: 'mandapeshwar',
    name: 'Mandapeshwar',
    aliases: ['Mandapeshwar - I.C. Colony', 'I.C. Colony'],
    lat: 19.2495856,
    lng: 72.8458001,
    lines: ['line-2a'],
    interchange: false
  },
  'eksar': {
    id: 'eksar',
    name: 'Eksar',
    aliases: [],
    lat: 19.2403773,
    lng: 72.8434456,
    lines: ['line-2a'],
    interchange: false
  },
  'borivali-west': {
    id: 'borivali-west',
    name: 'Borivali West',
    aliases: ['Borivali', 'Boriwali', 'Borivali (West)'],
    lat: 19.2313925,
    lng: 72.8408607,
    lines: ['line-2a'],
    interchange: false,
    connections: ['Western Railway (Borivali)']
  },
  'shimpoli': {
    id: 'shimpoli',
    name: 'Shimpoli',
    aliases: [],
    lat: 19.2228332,
    lng: 72.8409432,
    lines: ['line-2a'],
    interchange: false
  },
  'kandivli-west': {
    id: 'kandivli-west',
    name: 'Kandivli West',
    aliases: ['Kandivali', 'Kandivli', 'Kandivali West', 'Kandivli (W)'],
    lat: 19.2140036,
    lng: 72.8373054,
    lines: ['line-2a'],
    interchange: false,
    connections: ['Western Railway (Kandivali)']
  },
  'dahanukarwadi': {
    id: 'dahanukarwadi',
    name: 'Dahanukarwadi',
    aliases: ['Dahanukar Road'],
    lat: 19.2062315,
    lng: 72.8348068,
    lines: ['line-2a'],
    interchange: false
  },
  'valnai-meeth-chowky': {
    id: 'valnai-meeth-chowky',
    name: 'Valnai – Meeth Chowky',
    aliases: ['Valnai-Meeth Chowky'],
    lat: 19.1968293,
    lng: 72.8337752,
    lines: ['line-2a'],
    interchange: false
  },
  'malad-west': {
    id: 'malad-west',
    name: 'Malad West',
    aliases: ['Malad', 'Malad (West)'],
    lat: 19.1852851,
    lng: 72.8358611,
    lines: ['line-2a'],
    interchange: false,
    connections: ['Western Railway (Malad)']
  },
  'lower-malad': {
    id: 'lower-malad',
    name: 'Lower Malad',
    aliases: [],
    lat: 19.1730984,
    lng: 72.8364801,
    lines: ['line-2a'],
    interchange: false
  },
  'bangur-nagar': {
    id: 'bangur-nagar',
    name: 'Bangur Nagar',
    aliases: [],
    lat: 19.1624723,
    lng: 72.8348708,
    lines: ['line-2a'],
    interchange: false
  },
  'goregaon-west': {
    id: 'goregaon-west',
    name: 'Goregaon West',
    aliases: ['Goregaon (West)'],
    lat: 19.1530241,
    lng: 72.8356664,
    lines: ['line-2a'],
    interchange: false,
    connections: ['Western Railway (Goregaon)']
  },
  'oshiwara': {
    id: 'oshiwara',
    name: 'Oshiwara',
    aliases: [],
    lat: 19.1460351,
    lng: 72.833952,
    lines: ['line-2a'],
    interchange: false
  },
  'lower-oshiwara': {
    id: 'lower-oshiwara',
    name: 'Lower Oshiwara',
    aliases: [],
    lat: 19.1406979,
    lng: 72.8317139,
    lines: ['line-2a'],
    interchange: false
  },
  'andheri-west': {
    id: 'andheri-west',
    name: 'Andheri West',
    aliases: ['Andheri (West)'],
    lat: 19.1291337,
    lng: 72.8314307,
    lines: ['line-2a'],
    interchange: false,
    connections: ['Western Railway (Andheri)', 'Metro Line 1 (D.N. Nagar)']
  },
  'chembur': {
    id: 'chembur',
    name: 'Chembur',
    aliases: ['Chembur Metro', 'Guru Tegh Bahadur Nagar'],
    lat: 19.0541298,
    lng: 72.8928064,
    lines: ['line-2b'],
    interchange: true,
    connections: ['Mumbai Monorail', 'Central Railway (Chembur)']
  },
  'diamond-garden': {
    id: 'diamond-garden',
    name: 'Diamond Garden',
    aliases: ['Deshbhakt N.G. Acharya Udyan', 'Diamond Garden, Chembur'],
    lat: 19.0517191,
    lng: 72.9018378,
    lines: ['line-2b'],
    interchange: false
  },
  'csm-chowk': {
    id: 'csm-chowk',
    name: 'Chhatrapati Shivaji Maharaj Chowk',
    aliases: ['CSM Chowk', 'CSM Chowk (Chembur)', 'VNP & RC Marg Junction'],
    lat: 19.0526419,
    lng: 72.8942789,
    lines: ['line-2b'],
    interchange: false,
    connections: ['Mumbai Monorail']
  },
  'shivaji-chowk': {
    id: 'shivaji-chowk',
    name: 'Shivaji Chowk',
    aliases: ['Shivaji Chowk (Chembur)'],
    lat: 19.0479383,
    lng: 72.9069806,
    lines: ['line-2b'],
    interchange: false
  },
  'deonar': {
    id: 'deonar',
    name: 'Deonar',
    aliases: [],
    lat: 19.0448332,
    lng: 72.917495,
    lines: ['line-2b'],
    interchange: false,
    connections: ['Harbour Line (Deonar)']
  },
  'mankhurd': {
    id: 'mankhurd',
    name: 'Mankhurd',
    aliases: [],
    lat: 19.0492166,
    lng: 72.931231,
    lines: ['line-2b'],
    interchange: true,
    connections: ['Harbour Line (Mankhurd)', 'Metro Line 8 (planned)']
  },
  'mandale': {
    id: 'mandale',
    name: 'Maharashtranagar Mandale',
    aliases: ['Mandale', 'Maharashtranagar'],
    lat: 19.0495916,
    lng: 72.9386612,
    lines: ['line-2b'],
    interchange: false
  },
  'aarey-jvlr': {
    id: 'aarey-jvlr',
    name: 'Aarey JVLR',
    aliases: ['Aarey Colony', 'JVLR', 'Aarey Jogeshwari Vikhroli Link Road'],
    lat: 19.130699,
    lng: 72.884309,
    lines: ['line-3'],
    interchange: false
  },
  'seepz': {
    id: 'seepz',
    name: 'SEEPZ',
    aliases: ['SEEPZ Village', 'SEEPZ Andheri', 'MIDC SEEPZ'],
    lat: 19.1259985,
    lng: 72.8737266,
    lines: ['line-3'],
    interchange: true,
    connections: ['Metro Line 6 (under construction)']
  },
  'midc-andheri': {
    id: 'midc-andheri',
    name: 'MIDC Andheri',
    aliases: ['MIDC - Andheri', 'MIDC Andheri (E)'],
    lat: 19.1173537,
    lng: 72.8735966,
    lines: ['line-3'],
    interchange: false
  },
  'csia-t2': {
    id: 'csia-t2',
    name: 'CSIA Terminal 2',
    aliases: ['Chhatrapati Shivaji Maharaj International Airport - T2', 'Airport T2', 'T2'],
    lat: 19.1023335,
    lng: 72.8744692,
    lines: ['line-3'],
    interchange: true,
    connections: ['CSMIA Terminal 2', 'Metro Line 7A (under construction)']
  },
  'sahar-road': {
    id: 'sahar-road',
    name: 'Sahar Road',
    aliases: [],
    lat: 19.102196,
    lng: 72.8652361,
    lines: ['line-3'],
    interchange: false
  },
  'csia-t1': {
    id: 'csia-t1',
    name: 'CSIA Terminal 1',
    aliases: ['Chhatrapati Shivaji Maharaj International Airport - T1', 'Airport T1', 'T1'],
    lat: 19.093899,
    lng: 72.8535765,
    lines: ['line-3'],
    interchange: false,
    connections: ['CSMIA Terminal 1']
  },
  'santacruz': {
    id: 'santacruz',
    name: 'Santacruz',
    aliases: ['Santa Cruz'],
    lat: 19.0792887,
    lng: 72.8471185,
    lines: ['line-3'],
    interchange: false,
    connections: ['Western Railway (Santa Cruz)']
  },
  'bandra-colony': {
    id: 'bandra-colony',
    name: 'Bandra Colony',
    aliases: [],
    lat: 19.0699627,
    lng: 72.8493601,
    lines: ['line-3'],
    interchange: false
  },
  'bkc': {
    id: 'bkc',
    name: 'Bandra Kurla Complex',
    aliases: ['BKC', 'BKC Metro'],
    lat: 19.0606629,
    lng: 72.8546797,
    lines: ['line-3', 'line-2b'],
    interchange: true
  },
  'dharavi': {
    id: 'dharavi',
    name: 'Dharavi',
    aliases: [],
    lat: 19.0462612,
    lng: 72.849741,
    lines: ['line-3'],
    interchange: false
  },
  'shitaladevi-mandir': {
    id: 'shitaladevi-mandir',
    name: 'Shitaladevi Mandir',
    aliases: ['Shitala Devi Mandir', 'Shitaladevi'],
    lat: 19.0384641,
    lng: 72.8419646,
    lines: ['line-3'],
    interchange: false
  },
  'dadar': {
    id: 'dadar',
    name: 'Dadar',
    aliases: ['SBI-Dadar', 'Dadar (SBI)', 'Dadar Metro'],
    lat: 19.0246547,
    lng: 72.8399280,
    lines: ['line-3'],
    interchange: true,
    connections: ['Western & Central Railway (Dadar)', 'Metro Line 4 (under construction)']
  },
  'siddhivinayak': {
    id: 'siddhivinayak',
    name: 'Siddhivinayak',
    aliases: ['Siddhivinayak Temple'],
    lat: 19.0158935,
    lng: 72.8309199,
    lines: ['line-3'],
    interchange: false
  },
  'worli': {
    id: 'worli',
    name: 'Worli',
    aliases: [],
    lat: 19.0086057,
    lng: 72.8192741,
    lines: ['line-3'],
    interchange: false
  },
  'acharya-atre-chowk': {
    id: 'acharya-atre-chowk',
    name: 'Acharya Atre Chowk',
    aliases: ['Acharya Atre Chowk, Worli', 'Senapati Bapat Marg'],
    lat: 18.9978202,
    lng: 72.8177201,
    lines: ['line-3'],
    interchange: false
  },
  'science-centre': {
    id: 'science-centre',
    name: 'Science Centre',
    aliases: ['Nehru Science Centre'],
    lat: 18.9908949,
    lng: 72.8213521,
    lines: ['line-3'],
    interchange: false
  },
  'mahalaxmi': {
    id: 'mahalaxmi',
    name: 'Mahalaxmi',
    aliases: ['Mahalaxmi - Kataria',
    ],
    lat: 18.979467,
    lng: 72.8254006,
    lines: ['line-3'],
    interchange: false,
    connections: ['Western Railway (Mahalaxmi)', 'Mumbai Monorail']
  },
  'jagannath-shankar-sheth': {
    id: 'jagannath-shankar-sheth',
    name: 'Jagannath Shankar Sheth',
    aliases: ['J.J. Sheth', 'Jagannath Shankar Sheth Metro'],
    lat: 18.9699923,
    lng: 72.8211795,
    lines: ['line-3'],
    interchange: false,
    connections: ['Western Railway (Mumbai Central)']
  },
  'grant-road': {
    id: 'grant-road',
    name: 'Grant Road',
    aliases: [],
    lat: 18.9632181,
    lng: 72.8180437,
    lines: ['line-3'],
    interchange: false,
    connections: ['Western Railway (Grant Road)']
  },
  'girgaon': {
    id: 'girgaon',
    name: 'Girgaon',
    aliases: [],
    lat: 18.9521015,
    lng: 72.8222065,
    lines: ['line-3'],
    interchange: false
  },
  'kalbadevi': {
    id: 'kalbadevi',
    name: 'Kalbadevi',
    aliases: ['Kalbadevi Road'],
    lat: 18.946329,
    lng: 72.827193,
    lines: ['line-3'],
    interchange: false
  },
  'csmt': {
    id: 'csmt',
    name: 'Chhatrapati Shivaji Maharaj Terminus',
    aliases: ['CSMT', 'CST', 'Chhatrapati Shivaji Terminus'],
    lat: 18.9408329,
    lng: 72.831861,
    lines: ['line-3'],
    interchange: true,
    connections: ['Central & Harbour Line (CSMT)', 'Indian Railways', 'Metro Line 11 (planned)']
  },
  'hutatma-chowk': {
    id: 'hutatma-chowk',
    name: 'Hutatma Chowk',
    aliases: ['Flora Fountain'],
    lat: 18.9341849,
    lng: 72.8325037,
    lines: ['line-3'],
    interchange: false
  },
  'churchgate': {
    id: 'churchgate',
    name: 'Churchgate',
    aliases: [],
    lat: 18.9314946,
    lng: 72.8269394,
    lines: ['line-3'],
    interchange: false,
    connections: ['Western Railway (Churchgate)']
  },
  'vidhan-bhavan': {
    id: 'vidhan-bhavan',
    name: 'Vidhan Bhavan',
    aliases: [],
    lat: 18.9247813,
    lng: 72.8254934,
    lines: ['line-3'],
    interchange: false
  },
  'cuffe-parade': {
    id: 'cuffe-parade',
    name: 'Cuffe Parade',
    aliases: [],
    lat: 18.9135692,
    lng: 72.8207152,
    lines: ['line-3'],
    interchange: false
  },
  'gundavali': {
    id: 'gundavali',
    name: 'Gundavali',
    aliases: [],
    lat: 19.1145125,
    lng: 72.8551556,
    lines: ['line-7'],
    interchange: true,
    connections: ['Metro Line 1 (WEH / Chakala)']
  },
  'mogra': {
    id: 'mogra',
    name: 'Mogra',
    aliases: [],
    lat: 19.1284364,
    lng: 72.8554558,
    lines: ['line-7'],
    interchange: false
  },
  'jogeshwari-east': {
    id: 'jogeshwari-east',
    name: 'Jogeshwari East',
    aliases: ['Jogeshwari (East)', 'Jogeshwari East Metro'],
    lat: 19.1429455,
    lng: 72.855185,
    lines: ['line-7'],
    interchange: false,
    connections: ['Metro Line 3 (JVLR)']

  },
  'goregaon-east': {
    id: 'goregaon-east',
    name: 'Goregaon East',
    aliases: ['Goregaon (East)', 'Goregaon East Metro'],
    lat: 19.1524492,
    lng: 72.8565966,
    lines: ['line-7'],
    interchange: false,
    connections: ['Western Railway (Goregaon)']
  },
  'aarey': {
    id: 'aarey',
    name: 'Aarey',
    aliases: ['Aarey Colony', 'Aarey Road'],
    lat: 19.1693242,
    lng: 72.8587918,
    lines: ['line-7'],
    interchange: false
  },
  'dindoshi': {
    id: 'dindoshi',
    name: 'Dindoshi',
    aliases: ['Dindoshi Cancer Hospital'],
    lat: 19.1797579,
    lng: 72.8582976,
    lines: ['line-7'],
    interchange: false
  },
  'kurar': {
    id: 'kurar',
    name: 'Kurar',
    aliases: ['Kurar Village', 'Kurar Road'],
    lat: 19.1872999,
    lng: 72.8584547,
    lines: ['line-7'],
    interchange: false
  },
  'akurli': {
    id: 'akurli',
    name: 'Akurli',
    aliases: ['Akurli Road'],
    lat: 19.1981585,
    lng: 72.8604905,
    lines: ['line-7'],
    interchange: false
  },
  'poisar': {
    id: 'poisar',
    name: 'Poisar',
    aliases: [],
    lat: 19.2037713,
    lng: 72.8633227,
    lines: ['line-7'],
    interchange: false
  },
  'magathane': {
    id: 'magathane',
    name: 'Magathane',
    aliases: [],
    lat: 19.2167968,
    lng: 72.8668012,
    lines: ['line-7'],
    interchange: false
  },
  'devipada': {
    id: 'devipada',
    name: 'Devipada',
    aliases: [],
    lat: 19.2240357,
    lng: 72.8643251,
    lines: ['line-7'],
    interchange: false
  },
  'rashtriya-udyan': {
    id: 'rashtriya-udyan',
    name: 'Rashtriya Udyan',
    aliases: ['Rashtriya Udyan, Dahisar'],
    lat: 19.2346141,
    lng: 72.8631372,
    lines: ['line-7'],
    interchange: false
  },
  'ovaripada': {
    id: 'ovaripada',
    name: 'Ovaripada',
    aliases: ['Ovri Pada'],
    lat: 19.2431487,
    lng: 72.8641377,
    lines: ['line-7'],
    interchange: false
  },
  'kashigaon': {
    id: 'kashigaon',
    name: 'Kashigaon',
    aliases: ['Kashi Gaon'],
    lat: 19.2776661,
    lng: 72.8802398,
    lines: ['line-9'],
    interchange: false
  },
  'miragaon': {
    id: 'miragaon',
    name: 'Miragaon',
    aliases: ['Miragaon Road'],
    lat: 19.2710068,
    lng: 72.8806976,
    lines: ['line-9'],
    interchange: true,
    connections: ['Metro Line 4 (under construction)']
  },
  'pandurang-wadi': {
    id: 'pandurang-wadi',
    name: 'Pandurang Wadi',
    aliases: [],
    lat: 19.26115,
    lng: 72.8715306,
    lines: ['line-9'],
    interchange: false
  }
}

export const LINE_INFO = metroLines.reduce((acc, line) => {
  acc[line.id] = line
  return acc
}, {})

export function getStation(id) {
  return metroStations[id] || null
}

const ALIAS_INDEX = (() => {
  const index = {}
  Object.values(metroStations).forEach((station) => {
    const keys = [station.name.toLowerCase(), station.id.replace(/-/g, ' ').toLowerCase()]
    ;[...station.aliases, ...keys].forEach((alias) => {
      const a = alias.toLowerCase().trim()
      if (a) index[a] = station.id
    })
  })
  return index
})()

export function findStationByName(name) {
  if (!name) return null
  const normalized = String(name).toLowerCase().trim().replace(/\s+/g, ' ')
  return ALIAS_INDEX[normalized] ? getStation(ALIAS_INDEX[normalized]) : null
}

export function getLineColor(lineName, lineCode) {
  const text = `${lineName || ''} ${lineCode || ''}`.toLowerCase()
  if (/red/.test(text)) return '#e0241f'
  if (/yellow|ochre/.test(text)) return '#f7a800'
  if (/aqua|teal|turquoise|cyan/.test(text)) return '#00a0a7'
  if (/blue/.test(text)) return '#1755c4'
  if (/green/.test(text)) return '#16a34a'
  if (/orange/.test(text)) return '#f97316'
  if (/purple|violet/.test(text)) return '#7b2ff7'
  if (/pink|magenta/.test(text)) return '#ec4899'
  if (/grey|gray|silver/.test(text)) return '#64748b'
  if (/brown/.test(text)) return '#92400e'
  return '#4f46e5'
}

export function hexToRgba(hex, alpha = 1) {
  if (!hex || !/^#([0-9a-f]{6})$/i.test(hex)) return `rgba(79, 70, 229, ${alpha})`
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}