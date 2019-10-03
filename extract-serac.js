#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const stringify = require('csv-stringify');
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

const baseUrl = 'https://api.camptocamp.org';
const preferredLangs = ['fr', 'en', 'it', 'en', 'de', 'ca', 'eu'];

let user;
let password;
let dbuser;
let dbpassword;
let fileOutput;

const i18n = Object.assign(
  {
    true: 'oui',
    false: 'non'
  },
  {
    hiking: 'randonnée',
    ice_climbing: 'cascade de glace',
    mountain_biking: 'VTT',
    mountain_climbing: 'rocher haute-montagne',
    paragliding: 'parapente',
    rock_climbing: 'escalade',
    skitouring: 'ski de randonnée',
    slacklining: 'slackline',
    snowshoeing: 'raquettes',
    snow_ice_mixed: 'neige glace mixte',
    via_ferrata: 'via ferrata'
  },
  {
    empty: 'vide',
    draft: 'ébauche',
    medium: 'moyen',
    fine: 'bon',
    great: 'excellent'
  },
  {
    avalanche: 'avalanche',
    stone_fall: 'chute de pierres',
    falling_ice: 'chute de glace',
    person_fall: "chute d'une personne",
    crevasse_fall: 'chute en crevasse',
    roped_fall: 'chute encordé',
    physical_failure: 'défaillance physique',
    lightning: 'foudre',
    other: 'autre'
  },
  {
    severity_no: 'pas de blessure',
    '1d_to_3d': 'De 1 à 3 jours',
    '4d_to_1m': 'De 4 jours à 1 mois',
    '1m_to_3m': 'De 1 à 3 mois',
    more_than_3m: 'supérieur à 3 mois'
  },
  {
    level_1: '1 - faible',
    level_2: '2 - limité',
    level_3: '3 - marqué',
    level_4: '4 - fort',
    level_5: '5 - très fort',
    level_na: 'non renseigné'
  },
  {
    slope_lt_30: '<30',
    slope_30_35: '30-35',
    slope_35_40: '35-40',
    slope_40_45: '40-45',
    slope_gt_45: '>45'
  },
  {
    female: 'F',
    male: 'H'
  },
  {
    primary_impacted: 'victime principale',
    secondary_impacted: 'victime secondaire',
    internal_witness: 'témoin direct',
    external_witness: 'témoin extérieur'
  },
  {
    non_autonomous: 'non autonome',
    autonomous: 'autonome',
    initiator: 'débrouillé',
    expert: 'expert'
  },
  {
    activity_rate_1: '1ère fois de sa vie',
    activity_rate_10: "moins d'1 fois par mois",
    activity_rate_150: 'au moins 3 fois par semaine',
    activity_rate_20: '1 fois par mois',
    activity_rate_30: '2 à 3 fois par mois',
    activity_rate_5: "moins d'1 fois par an",
    activity_rate_50: '1 à 2 fois par semaine'
  },
  {
    nb_outings_14: 'de 10 à 14',
    nb_outings_15: '15 et plus',
    nb_outings_4: 'de 0 à 4',
    nb_outings_9: 'de 5 à 9'
  },
  {
    // FIXME: il y a un souci probable dans les traductions
    previous_injuries_2: 'autres blessures',
    previous_injuries_3: 'autres blessures'
  }
);

let token;

let reports = [];

async function login() {
  try {
    const response = await axios.post(`${baseUrl}/users/login`, {
      username: user,
      password,
      discourse: false,
      remember_me: true
    });
    return response.data.token;
  } catch (error) {
    console.error('Invalid username or password, cannot authenticate');
    process.exit(1);
  }
}

async function xreports(offset) {
  const response = await axios.get(`${baseUrl}/xreports`, {
    params: { offset },
    headers: { Authorization: `JWT token="${token}"` }
  });
  return response.data;
}

async function xreport(id) {
  const response = await axios.get(`${baseUrl}/xreports/${id}`, {
    headers: { Authorization: `JWT token="${token}"` }
  });
  return response.data;
}

function findBestLocale(langs) {
  return (lang = preferredLangs.find(lang => langs.includes(lang)) || langs[0]);
}

function reportToCsvLine(report) {
  const lang = findBestLocale(report.available_langs);
  const locale = report.locales.find(locale => locale.lang === lang);
  return [
    report.document_id,
    `https://www.camptocamp.org/xreports/${report.document_id}`,

    locale.title,
    join(report.activities, activity => i18n[activity]),
    i18n[report.quality],

    geometry(report.geometry),
    report.elevation,
    join(report.areas, area => {
      const l = findBestLocale(area.locales.map(l => l.lang));
      return area.locales.find(locale => locale.lang === l).title;
    }),

    report.author.name,
    `https://www.camptocamp.org/users/${report.author.user_id}`,
    report.date,
    join(report.event_type, type => i18n[type]),
    report.nb_participants,
    associated(report.associations.users, 'users'),
    report.nb_impacted,
    i18n[report.rescue],
    i18n[report.severity],
    i18n[report.avalanche_level],
    i18n[report.avalanche_slope],
    report.age,
    i18n[report.gender],
    i18n[report.author_status],
    i18n[report.autonomy],
    i18n[report.activity_rate],
    i18n[report.nb_outings],
    i18n[report.previous_injuries],

    locale.summary,
    locale.description,
    locale.place,
    locale.route_study,
    locale.conditions,
    locale.training,
    locale.motivations,
    locale.group_management,
    locale.risk,
    locale.time_management,
    locale.safety,
    locale.reduce_impact,
    locale.increase_impact,
    locale.modifications,
    locale.other_comments,

    associated(report.associations.routes, 'routes'),
    associated(report.associations.outings, 'outings'),
    associated(report.associations.articles, 'articles')
  ];
}

const header = [
  'Document',
  'Document (lien)',

  'Titre',
  'Activités',
  'Complétude',

  'Localisation',
  'Altitude',
  'Régions',

  'Contributeur',
  'Contributeur (lien)',
  'Date',
  "Type d'évènement",
  'Nombre de participants',
  'Participants associés',
  'Nombre de personnes touchées',
  'Intervention des services de secours',
  'Gravité',
  "Niveau de risque d'avalanche",
  'Pente de la zone de départ',
  'Âge',
  'Sexe',
  'Implication dans la situation',
  'Niveau de pratique',
  "Fréquence de pratique dans l'activité",
  'Nombre de sorties',
  'Blessures antérieures',

  'Résumé',
  'Description',
  'Lieu',
  "Étude de l'itinéraire",
  'Conditions',
  'Préparation physique et niveau technique',
  'Motivations',
  'Gestion du groupe',
  "Niveau de l'attention et évaluation des risques",
  "Gestion de l'horaire",
  'Mesures et techniques de sécurité mises en oeuvre',
  "Éléments ayant atténué les conséquences de l'évènement",
  "Éléments ayant aggravé les conséquences de l'évènement",
  'Conséquences sur les pratiques',
  'Conséquences physiques et autres commentaires',

  'Itinéraires associés',
  'Sorties associées',
  'Articles associés'
];

function join(items, mapFn) {
  return items.map(mapFn).reduce((acc, value) => acc + value + ',', '');
}

function associated(items, type) {
  return join(
    items,
    item => `https://www.camptocamp.org/${type}/${item.document_id}`
  );
}

function geometry(geometry) {
  if (!geometry || !geometry.geom) {
    return null;
  }
  return '[' + JSON.parse(geometry.geom).coordinates.join(':') + ']';
}

function reportToJson(report) {
  return {
    // anonymous: true,
    elevation: report.elevation,
    nb_participants: report.nb_participants,
    geometry: report.geometry.geom,
    age: report.age,
    // type: 'x',
    author: report.author,
    autonomy: report.autonomy,
    avalanche_slope: report.avalanche_slope,
    /* associations: {
      images: [],
      outings: [],
      articles: [],
      users: [],
      waypoints: []
    },
    quality: 'medium', */
    activities: report.activities,
    nb_outings: report.nb_outings,
    // document_id: report.document_id,
    gender: report.gender,
    // available_langs: ['fr'],
    nb_impacted: report.nb_impacted,
    // areas: [],
    // protected
    date: report.date,
    rescue: report.rescue,
    // disable_comments: false,
    // version,
    author_status: report.author_status,
    event_type: report.event_type,
    severity: report.severity,
    activity_rate: report.activity_rate,
    previous_injuries: report.previous_injuries,
    avalanche_level: report.avalanche_level,
    locales: [
      {
        modifications: report.locales[0].modifications,
        motivations: report.locales[0].motivations,
        training: report.locales[0].training,
        place: report.locales[0].place,
        route_study: report.locales[0].route_study,
        summary: report.locales[0].summary,
        safety: report.locales[0].safety,
        description: report.locales[0].description,
        reduce_impact: report.locales[0].reduce_impact,
        risk: report.locales[0].risk,
        title: report.locales[0].title,
        other_comments: report.locales[0].other_comments,
        increase_impact: report.locales[0].increase_impact,
        time_management: report.locales[0].time_management,
        conditions: report.locales[0].conditions,
        group_management: report.locales[0].group_management
        // version
        // topic_id
        // lang: 'fr'
      }
    ]
  };
}

async function main() {
  token = await login();

  let offset = 0;
  let { total } = await xreports(offset, token);
  console.log(`${total} reports in DB`);
  let i = 0;
  do {
    console.log(
      `Fetching reports ${offset + 1}-${Math.min(offset + 30, total)}/${total}`
    );
    let { documents } = await xreports(offset, token);
    let newReports = await Promise.all(
      documents.map(async report => {
        return await xreport(report.document_id);
      })
    );
    reports = [...reports, ...newReports.map(reportToJson)];
    offset += 30;
  } while (offset <= total);

  let url = `mongodb+srv://${dbuser}:${dbpassword}@cluster0-sgktu.mongodb.net/test?retryWrites=true&w=majority`;
  const client = new MongoClient(url, { useNewUrlParser: true });
  client.connect(err => {
    assert.equal(null, err);
    console.log('Connected successfully to server');
    const collection = client.db('test').collection('xreport');
    // perform actions on the collection object
    collection.insertMany(reports, () => {
      client.close();
    });
  });
  reports.forEach(report => {});
}

const argv = require('yargs')
  .options({
    u: {
      alias: 'user',
      describe: 'Username for authentication',
      type: 'string',
      demandOption: true
    },
    p: {
      alias: 'password',
      describe: 'Password for authentication',
      type: 'string',
      demandOption: true
    },
    dbu: {
      alias: 'dbuser',
      describe: 'Username for authentication',
      type: 'string',
      demandOption: true
    },
    dbp: {
      alias: 'dbpassword',
      describe: 'Password for authentication',
      type: 'string',
      demandOption: true
    },
    o: {
      alias: 'output',
      describe: 'Where to store ouput CSV file',
      default: 'xreports.csv',
      type: 'string'
    }
  })
  .alias('v', 'version')
  .version()
  .describe('v', 'Show version information')
  .alias('h', 'help')
  .help('h')
  .usage('Usage: extract-serac -u <username> -p <password> [-o <file>]').argv;

user = argv.user;
password = argv.password;
dbuser = argv.dbuser;
dbpassword = argv.dbpassword;
fileOutput = path.resolve(argv.output);

main();
