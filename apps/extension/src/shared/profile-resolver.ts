// ---------------------------------------------------------------------------
// D'Vantage Extension — Shared Profile Resolver
//
// Centralises AutofillFieldKey → profile value mapping so that all site
// adapters and the side panel use identical resolution logic.
//
// Before D13 Tier A, each adapter had an inline switch statement. This led
// to divergence as new keys were added. All adapters now import and call
// resolveProfileValue(); the panel has its own display variant (with
// truncation) that delegates here for non-display cases.
//
// Placement in shared/ (not content/) allows the side panel to import it
// for the ready-state field-value preview without violating the content/
// script isolation boundary.
// ---------------------------------------------------------------------------

import type { AutofillFieldKey, UserProfile } from './types';

/**
 * Resolve a profile value for a given AutofillFieldKey.
 *
 * Returns the string to write into the form input, or null if the value
 * cannot be determined (profile missing, field empty, etc.).
 *
 * Resolution rules:
 *   fullName       → "${firstName} ${lastName}" (trimmed)
 *   firstName      → profile.firstName
 *   lastName       → profile.lastName
 *   email          → profile.email
 *   phone          → profile.phone
 *   linkedinUrl    → profile.linkedinUrl
 *   github         → profile.github
 *   location       → profile.location
 *   summary        → profile.summary (full text — callers may truncate for display)
 *   topSkills      → profile.topSkills joined by ", "
 *   currentRole    → profile.currentRole
 *   currentTitle   → profile.experience[0].title
 *   currentCompany → profile.experience[0].company
 *   university     → profile.education[0].institution
 *   degree         → "${degree} in ${field}" or just degree if no field
 *   graduationYear → year extracted from profile.education[0].endDate
 */
export function resolveProfileValue(key: AutofillFieldKey, profile: UserProfile): string | null {
  switch (key) {
    case 'fullName':
      return `${profile.firstName} ${profile.lastName}`.trim() || null;

    case 'firstName':
      return profile.firstName || null;

    case 'lastName':
      return profile.lastName || null;

    case 'email':
      return profile.email || null;

    case 'phone':
      return profile.phone;

    case 'linkedinUrl':
      return profile.linkedinUrl;

    case 'github':
      return profile.github;

    case 'location':
      return profile.location;

    case 'summary':
      return profile.summary;

    case 'topSkills':
      return profile.topSkills.length > 0 ? profile.topSkills.join(', ') : null;

    case 'currentRole':
      return profile.currentRole;

    case 'currentTitle':
      return profile.experience[0]?.title ?? null;

    case 'currentCompany':
      return profile.experience[0]?.company ?? null;

    case 'university':
      return profile.education[0]?.institution ?? null;

    case 'degree': {
      const edu = profile.education[0];
      if (!edu) return null;
      const deg = edu.degree?.trim();
      const field = edu.field?.trim();
      if (!deg) return null;
      return field ? `${deg} in ${field}` : deg;
    }

    case 'graduationYear': {
      const edu = profile.education[0];
      if (!edu?.endDate) return null;
      // Extract 4-digit year from various date formats:
      // "May 2020", "2020-05", "2020", "Spring 2022"
      const match = String(edu.endDate).match(/\b(20\d{2}|19\d{2})\b/);
      return match?.[1] ?? null;
    }

    default:
      return null;
  }
}
