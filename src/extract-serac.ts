#!/usr/bin/env node

import axios, { AxiosResponse } from 'axios';
import { Input, stringify } from 'csv-stringify';
import { writeFile } from 'fs';
import { normalize, resolve } from 'path';
import yargs from 'yargs';

import type { Association, Geometry, XReport } from './xreport';
import type { XReports } from './xreports';

const baseUrl = 'https://api.camptocamp.org';
const preferredLangs = ['fr', 'en', 'it', 'es', 'de', 'ca', 'eu'];

const i18n: Record<string, string | undefined> = Object.assign(
  { '': undefined },
  {
    true: 'oui',
    false: 'non',
  },
  {
    sport_climbing: 'escalade en falaise',
    multipitch_climbing: 'escalade en grande voie',
    alpine_climbing: 'rocher montagne (TA)',
    ice_climbing: 'cascade de glace',
    skitouring: 'ski de randonnée',
    other: 'autres activités',
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
    stone_ice_fall: 'chute de pierre/glace/sérac',
    ice_cornice_collapse: 'effondrement cascade ou corniche',
    person_fall: "chute d'une personne",
    crevasse_fall: 'chute en crevasse',
    physical_failure: 'défaillance physique',
    blocked_person: 'personne bloquée',
    weather_event: 'évènement météo',
    safety_operation: 'manœuvre de sécurité',
    critical_situation: 'situation complexe sans incident',
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
    expert: 'expert',
  },
  {
    activity_rate_y5: '5 fois par an',
    activity_rate_m2: '2 fois par mois',
    activity_rate_w1: '1 fois par semaine',
  },
  {
    no: 'non',
    previous_injuries_2: 'autres blessures',
  },
  {
    federal_supervisor: 'Initiateur fédéral',
    federal_trainer: 'Entraineur fédéral',
    professional_diploma: 'Diplôme professionnel',
  },
  {
    no_supervision: 'Non encadré',
    federal_supervision: 'Encadrement fédéral',
    professional_supervision: 'Encadrement professionnel',
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
  .usage('Usage: extract-serac -u <username> -p <password> [-o <file>]')
  .parseSync();

const user: string = argv.user;
const password: string = argv.password;
const fileOutput: string = resolve(argv.output);

let token: string;

let reports: Input = [];

async function login(): Promise<string> {
  try {
    const response = await axios.post<
      { token: string },
      AxiosResponse<{ token: string }>,
      { username: string; password: string; discourse: boolean; remember_me: boolean }
    >(`${baseUrl}/users/login`, {
      username: user,
      password,
      discourse: false,
      remember_me: true,
    });
    return response.data.token;
  } catch {
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
  return preferredLangs.find((lang) => langs.includes(lang)) || langs[0] || 'en';
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

function reportToCsvLine(report: XReport): Input {
  const lang = findBestLocale(report.available_langs);
  const locale = report.locales.find((locale) => locale.lang === lang);
  return [
    report.document_id,
    `https://www.camptocamp.org/xreports/${report.document_id}`,

    locale?.title,
    i18n[report.event_activity ?? ''],
    i18n[report.quality],

    geometry(report.geometry),
    report.elevation,
    join(report.areas, (area) => {
      const l = findBestLocale(area.locales.map((l) => l.lang));
      return area.locales.find((locale) => locale.lang === l)?.title;
    }),

    report.author?.name,
    `https://www.camptocamp.org/users/${report.author?.user_id}`,
    report.date,
    i18n[report.event_type ?? ''],
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
    i18n[report.previous_injuries ?? ''],
    i18n[report.qualification ?? ''],
    i18n[report.supervision ?? ''],

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
  'Blessures antérieures',
  'Qualification',
  'Encadrement',

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
      documents.map(async (report) => {
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
    if (!output) {
      throw new Error('No output');
    }
    writeFile(fileOutput, output, (err) => {
      if (err) {
        throw err;
      }
      console.log('Done - output saved to ' + normalize(fileOutput));
    });
  });
}

main();
