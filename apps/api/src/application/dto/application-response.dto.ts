import type { ApplicationStatus } from '@vantage/database';

export interface ApplicationResponseDto {
  id:                string;
  userId:            string;
  jobDescriptionId:  string | null;
  company:           string;
  role:              string;
  location:          string | null;
  status:            ApplicationStatus;
  appliedDate:       string;   // YYYY-MM-DD
  notes:             string | null;
  createdAt:         string;
  updatedAt:         string;
}

export interface ApplicationListResponseDto {
  data:       ApplicationResponseDto[];
  nextCursor: string | null;
  total:      number;
}
