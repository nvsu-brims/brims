// ---------------------------------------------------------------------------
// Colleges and their student organizations — hardcoded reference data.
// Replaces the `colleges` / `organizations` database tables the old PHP app
// read from; kept in code since the list is small, stable, and has no admin
// screen for editing it.
//
// Rules:
//   - `code` is the permanent identifier. Never rename a code; user records
//     store it. To retire a college or organization, add an `active: false`
//     field instead of deleting it, so existing users still resolve.
//   - An organization code is only unique WITHIN its college — always
//     identify an organization by the pair (collegeCode, organizationCode),
//     never by organization code alone.
// ---------------------------------------------------------------------------

export interface Organization {
  readonly code: string;
  readonly name: string;
}

export interface College {
  readonly code: string;
  readonly name: string;
  readonly organizations: readonly Organization[];
}

// Order matches the source table (by original id), which is also the order
// the PHP dropdowns listed them in.
export const COLLEGES = [
  {
    code: "COA",
    name: "College of Agriculture",
    organizations: [
      { code: "CA-SC", name: "College of Agriculture Student Council" },
      { code: "JFP/JFT", name: "Junior Fisheries Professionals / Junior Fisheries Technologists" },
      { code: "ASSA", name: "Animal Science Student Alliance" },
    ],
  },
  {
    code: "CAS",
    name: "College of Arts and Sciences",
    organizations: [
      { code: "CAS-SC", name: "College of Arts and Sciences Student Council" },
      { code: "AFRB", name: "Association of Future Researchers and Biologists" },
      { code: "MC", name: "Mathematics Club" },
    ],
  },
  {
    code: "CBE",
    name: "College of Business Education",
    organizations: [
      { code: "CBE-SC", name: "College of Business Education Student Council" },
      { code: "JFINEX", name: "Junior Financial Executives" },
      { code: "ASAA", name: "Agribusiness Students and Alumni Association" },
      { code: "JPES", name: "Junior Philippine Economics Society" },
      { code: "JMA/PJMA", name: "Junior Marketing Association / Philippine Junior Marketing Association" },
      { code: "HRSAP", name: "Human Resource Students' Association of the Philippines" },
    ],
  },
  {
    code: "CFERM",
    name: "College of Forestry, Environmental, and Resource Management",
    organizations: [
      { code: "CFERM-SC", name: "College of Forestry, Environmental, and Resource Management Student Council" },
      { code: "SUN", name: "Student Union for Nature" },
      { code: "4F", name: "Federation of Future Filipino Foresters" },
      { code: "4H", name: "Heads, Heart, Hand, and Health" },
    ],
  },
  {
    code: "CHE",
    name: "College of Human Ecology",
    organizations: [
      { code: "CHE-SC", name: "College of Human Ecology Student Council" },
      { code: "PAN", name: "Philippine Association of Nutrition" },
      { code: "OHMS", name: "Organization of Hotel Management Students" },
      { code: "ATI", name: "Association of Tourism Innovators" },
    ],
  },
  {
    code: "COE",
    name: "College of Engineering",
    organizations: [
      { code: "COE-SC", name: "College of Engineering Student Council" },
      { code: "ACES/JPICE", name: "Association of Civil Engineering Students / Junior Philippine Institute of Civil Engineers" },
      { code: "EASTS-TSSP", name: "Eastern Asia Society for Transportation Studies / Transportation Society of the Philippines, NVSU Student Chapter" },
      { code: "PSABE-PPG", name: "Philippine Society of Agricultural and Biosystems Engineers, Pre-Professional Group, NVSU Chapter" },
      { code: "AGES", name: "Association of Geodetic Engineering Students" },
    ],
  },
  {
    code: "CITE",
    name: "College of Information Technology Education",
    organizations: [
      { code: "CITE-SC", name: "College of Information Technology Education Student Council" },
      { code: "CSS", name: "Computer Science Society" },
      { code: "FITS", name: "Future Information Technologists Society" },
      { code: "AIMS", name: "Association of Information Managers Society" },
    ],
  },
  {
    code: "CTE",
    name: "College of Teacher Education",
    organizations: [
      { code: "CTE-SC", name: "College of Teacher Education Student Council" },
      { code: "ASSETS", name: "Association of Social Science Enthusiasts, Teachers & Students" },
      { code: "POETS", name: "Prime Organization of English Teachers & Students" },
      { code: "SPM", name: "Samahang Pangsekundaryang Mag-aaral ng NVSU" },
      { code: "FEECEA", name: "Future Elementary and Early Childhood Education Association" },
      { code: "ANAKFIL", name: "Asosasyon ng mga Nagpapakadalubhasa sa Filipino" },
      { code: "FSEO", name: "Future Science Educators Organization" },
      { code: "MMS", name: "Math Majors Society" },
      { code: "FIETA", name: "Future Industrial Educators & Trade Technicians Association" },
      { code: "ASK", name: "Alagad ng Sining at Kultura" },
      { code: "CMETI", name: "Confederation of Multiskilled Educators on Technology and Innovation" },
      { code: "HOPES", name: "Holistic Organization of Physical Education Students" },
    ],
  },
  {
    code: "CVM",
    name: "College of Veterinary Medicine",
    organizations: [
      { code: "CVM-SC", name: "College of Veterinary Medicine Student Council" },
      { code: "VSAS", name: "Veterinary Student Achievers Society" },
      { code: "SAVER", name: "Society for the Advancement of Veterinary Education and Research / Society for the Advancement of Veterinary Medicine and Research" },
      { code: "IVSA", name: "International Veterinary Students Association" },
    ],
  },
] as const satisfies readonly College[];

export type CollegeCode = (typeof COLLEGES)[number]["code"];

export function getCollege(code: string): (typeof COLLEGES)[number] | undefined {
  return COLLEGES.find((college) => college.code === code);
}

export function isValidCollege(code: string): code is CollegeCode {
  return getCollege(code) !== undefined;
}

/** The organizations that belong to a college; empty for an unknown college. */
export function getOrganizations(collegeCode: string): readonly Organization[] {
  return getCollege(collegeCode)?.organizations ?? [];
}

/** Server-side pairing check — port of isValidCollegeOrganization(). */
export function isValidCollegeOrganization(
  collegeCode: string,
  organizationCode: string
): boolean {
  return getOrganizations(collegeCode).some(
    (organization) => organization.code === organizationCode
  );
}

/** Full name for an organization code within a college (e.g. for a tooltip). */
export function getOrganizationName(
  collegeCode: string,
  organizationCode: string
): string | undefined {
  return getOrganizations(collegeCode).find(
    (organization) => organization.code === organizationCode
  )?.name;
}