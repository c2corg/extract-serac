#!/usr/bin/env node

import { writeFile } from 'fs';
import { normalize, resolve } from 'path';
import axios from 'axios';
import yargs from 'yargs';
import stringify from 'csv-stringify';

import { XReport, Geometry, Association } from './xreport';
import { XReports } from './xreports';

const baseUrl = 'https://api.camptocamp.org';
const preferredLangs = ['fr', 'en', 'it', 'es', 'de', 'ca', 'eu'];

const i18n: Record<string, string | undefined> = Object.assign(
  { '': undefined },
  {
    true: 'oui',
    false: 'non',
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
    via_ferrata: 'via ferrata',
  },
  {
    empty: 'vide',
    draft: 'ébauche',
    medium: 'moyen',
    fine: 'bon',
    great: 'excellent',
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
    other: 'autre',
  },
  {
    severity_no: 'pas de blessure',
    '1d_to_3d': 'De 1 à 3 jours',
    '4d_to_1m': 'De 4 jours à 1 mois',
    '1m_to_3m': 'De 1 à 3 mois',
    more_than_3m: 'supérieur à 3 mois',
  },
  {
    level_1: '1 - faible',
    level_2: '2 - limité',
    level_3: '3 - marqué',
    level_4: '4 - fort',
    level_5: '5 - très fort',
    level_na: 'non renseigné',
  },
  {
    slope_lt_30: '<30',
    slope_30_35: '30-35',
    slope_35_40: '35-40',
    slope_40_45: '40-45',
    slope_gt_45: '>45',
  },
  {
    female: 'F',
    male: 'H',
  },
  {
    primary_impacted: 'victime principale',
    secondary_impacted: 'victime secondaire',
    internal_witness: 'témoin direct',
    external_witness: 'témoin extérieur',
  },
  {
    non_autonomous: 'non autonome',
    autonomous: 'autonome',
    initiator: 'débrouillé',
    expert: 'expert',
  },
  {
    activity_rate_1: '1ère fois de sa vie',
    activity_rate_10: "moins d'1 fois par mois",
    activity_rate_150: 'au moins 3 fois par semaine',
    activity_rate_20: '1 fois par mois',
    activity_rate_30: '2 à 3 fois par mois',
    activity_rate_5: "moins d'1 fois par an",
    activity_rate_50: '1 à 2 fois par semaine',
  },
  {
    nb_outings_14: 'de 10 à 14',
    nb_outings_15: '15 et plus',
    nb_outings_4: 'de 0 à 4',
    nb_outings_9: 'de 5 à 9',
  },
  {
    // FIXME: there is most certainly a problem with translations
    previous_injuries_2: 'autres blessures',
    previous_injuries_3: 'autres blessures',
  },
);

const argv = yargs
  .options({
    user: {
      alias: 'u',
      describe: 'Username for authentication',
      type: 'string',
      demandOption: true,
    },
    password: {
      alias: 'p',
      describe: 'Password for authentication',
      type: 'string',
      demandOption: true,
    },
    output: {
      alias: 'o',
      describe: 'Where to store ouput CSV file',
      default: 'xreports.csv',
      type: 'string',
    },
  })
  .alias('v', 'version')
  .version()
  .describe('v', 'Show version information')
  .alias('h', 'help')
  .help('h')
  .usage('Usage: extract-serac -u <username> -p <password> [-o <file>]').argv;

const user: string = argv.user;
const password: string = argv.password;
const fileOutput: string = resolve(argv.output);

let token: string;

let reports: stringify.Input = [];

async function login(): Promise<string> {
  try {
    const response = await axios.post(`${baseUrl}/users/login`, {
      username: user,
      password,
      discourse: false,
      remember_me: true,
    });
    return response.data.token;
  } catch (error) {
    console.error('Invalid username or password, cannot authenticate');
    process.exit(1);
  }
}

async function xreports(offset: number): Promise<XReports> {
  const response = await axios.get<XReports>(`${baseUrl}/xreports`, {
    params: { offset },
    headers: { Authorization: `JWT token="${token}"` },
  });
  return response.data;
}

async function xreport(id: number): Promise<XReport> {
  const response = await axios.get<XReport>(`${baseUrl}/xreports/${id}`, {
    headers: { Authorization: `JWT token="${token}"` },
  });
  return response.data;
}

function findBestLocale(langs: string[]): string {
  return preferredLangs.find(lang => langs.includes(lang)) || langs[0];
}

function join<T>(items: T[], mapFn: (item: T) => string | undefined): string {
  const join: string = items
    .map(mapFn)
    .reduce((acc: string, value: string | undefined) => (value ? acc + value + ',' : acc), '');
  return join.length > 0 ? join.slice(0, -1) : join;
}

function associated(items: Association[], type: string): string {
  return join(items, (item: Association) => `https://www.camptocamp.org/${type}/${item.document_id}`);
}

function geometry(geometry?: Geometry): string | undefined {
  if (!geometry?.geom) {
    return undefined;
  }
  return '[' + JSON.parse(geometry.geom).coordinates.join(':') + ']';
}

function reportToCsvLine(report: XReport): stringify.Input {
  const lang = findBestLocale(report.available_langs);
  const locale = report.locales.find(locale => locale.lang === lang);
  return [
    report.document_id,
    `https://www.camptocamp.org/xreports/${report.document_id}`,

    locale?.title,
    join(report.activities, (activity: string) => i18n[activity]),
    i18n[report.quality],

    geometry(report.geometry),
    report.elevation,
    join(report.areas, area => {
      const l = findBestLocale(area.locales.map(l => l.lang));
      return area.locales.find(locale => locale.lang === l)?.title;
    }),

    report.author?.name,
    `https://www.camptocamp.org/users/${report.author?.user_id}`,
    report.date,
    join(report.event_type, (type: string) => i18n[type]),
    report.nb_participants,
    associated(report.associations.users, 'users'),
    report.nb_impacted,
    i18n[report.rescue ?? ''],
    i18n[report.severity ?? ''],
    i18n[report.avalanche_level ?? ''],
    i18n[report.avalanche_slope ?? ''],
    report.age,
    i18n[report.gender ?? ''],
    i18n[report.author_status ?? ''],
    i18n[report.autonomy ?? ''],
    i18n[report.activity_rate ?? ''],
    i18n[report.nb_outings ?? ''],
    i18n[report.previous_injuries ?? ''],

    locale?.summary,
    locale?.description,
    locale?.place,
    locale?.route_study,
    locale?.conditions,
    locale?.training,
    locale?.motivations,
    locale?.group_management,
    locale?.risk,
    locale?.time_management,
    locale?.safety,
    locale?.reduce_impact,
    locale?.increase_impact,
    locale?.modifications,
    locale?.other_comments,

    associated(report.associations.routes, 'routes'),
    associated(report.associations.outings, 'outings'),
    associated(report.associations.articles, 'articles'),
  ];
}

const header: string[] = [
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
  'Articles associés',
];

async function main(): Promise<void> {
  token = await login();

  let offset = 0;
  const { total } = await xreports(offset);
  console.log(`${total} reports in DB`);
  do {
    console.log(`Fetching reports ${offset + 1}-${Math.min(offset + 30, total)}/${total}`);
    const { documents } = await xreports(offset);
    const newReports = await Promise.all(
      documents.map(async report => {
        return await xreport(report.document_id);
      }),
    );
    reports = [...reports, ...newReports.map(reportToCsvLine)];
    offset += 30;
  } while (offset <= total);

  stringify([header, ...reports], { quoted: true }, (err, output) => {
    if (err) {
      throw err;
    }
    writeFile(fileOutput, output, err => {
      if (err) {
        throw err;
      }
      console.log('Done - output saved to ' + normalize(fileOutput));
    });
  });
}

main();
