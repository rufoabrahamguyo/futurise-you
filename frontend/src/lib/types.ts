/** Shapes returned by /api/v1. Keep in sync with the DRF serializers. */

export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  timezone: string;
  email_notifications: boolean;
  is_email_verified: boolean;
  ai_acknowledged_at: string | null;
  created_at: string;
}

export interface Choice {
  value: string;
  label: string;
}

export interface Meta {
  statuses: Choice[];
  employment_types: Choice[];
  work_arrangements: Choice[];
  document_types: Choice[];
  image_document_types: string[];
  reminder_types: Choice[];
  activity_types: Choice[];
  manual_activity_types: string[];
  max_upload_bytes: number;
  ai_daily_limit: number;
}

export interface Company {
  id: string;
  name: string;
}

export interface CompletenessItem {
  key: "job_description" | "submitted_documents" | "history";
  label: string;
  complete: boolean;
}

export interface Completeness {
  percent: number;
  items: CompletenessItem[];
}

export interface ApplicationSummary {
  id: string;
  company: Company;
  job_title: string;
  location: string;
  employment_type: string;
  work_arrangement: string;
  status: string;
  deadline: string | null;
  date_applied: string | null;
  submitted_at: string | null;
  completeness: Completeness;
  has_cv_attached: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Application extends ApplicationSummary {
  compensation: string;
  job_url: string;
  recruiter_name: string;
  recruiter_email: string;
  recruiter_phone: string;
  notes: string;
  status_changed_at: string;
}

export interface ApplicationInput {
  company_id?: string;
  company_name?: string;
  job_title?: string;
  location?: string;
  employment_type?: string;
  work_arrangement?: string;
  compensation?: string;
  job_url?: string;
  deadline?: string | null;
  date_applied?: string | null;
  recruiter_name?: string;
  recruiter_email?: string;
  recruiter_phone?: string;
  notes?: string;
}

export interface StatusChangeResult {
  application: Application;
  warnings: string[];
}

export interface Activity {
  id: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  occurred_at: string;
  is_system_generated: boolean;
  created_at: string;
  updated_at: string;
}

export interface Question {
  id: string;
  question: string;
  answer: string;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface ReminderApplication {
  id: string;
  job_title: string;
  company_name: string;
  status: string;
}

export interface Reminder {
  id: string;
  application: ReminderApplication;
  type: string;
  title: string;
  notes: string;
  remind_at: string;
  channels: ("in_app" | "email")[];
  status: "pending" | "sent" | "completed" | "cancelled";
  sent_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DashboardSummary {
  counts: {
    total: number;
    in_progress: number;
    interviews: number;
    offers: number;
    rejections: number;
    follow_ups_due: number;
  };
  by_status: Record<string, number>;
  recent: ApplicationSummary[];
  upcoming_reminders: Reminder[];
  activity: { date: string; count: number }[];
}

export interface AppNotification {
  id: string;
  kind: "reminder" | "export";
  title: string;
  body: string;
  link: string;
  read_at: string | null;
  created_at: string;
}

export interface DocumentVersion {
  id: string;
  version_number: number;
  original_filename: string;
  mime_type: string;
  size: number;
  sha256: string;
  created_at: string;
  previewable: boolean;
}

export interface LibraryDocument {
  id: string;
  title: string;
  type: string;
  is_master: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  latest_version: DocumentVersion | null;
  version_count: number;
  application_count: number;
}

export interface DocumentUsage {
  application_id: string;
  job_title: string;
  company_name: string;
  version_number: number;
  is_frozen: boolean;
}

export interface LibraryDocumentDetail extends LibraryDocument {
  versions: DocumentVersion[];
  usages: DocumentUsage[];
}

export interface ApplicationDocumentLink {
  id: string;
  role: string;
  is_frozen: boolean;
  frozen_at: string | null;
  added_after_submission: boolean;
  created_at: string;
  document_id: string;
  document_title: string;
  document_archived: boolean;
  latest_version_number: number | null;
  version: DocumentVersion;
}

export interface DownloadLink {
  url: string;
  expires_in: number;
  filename: string;
  mime_type: string;
}

export interface Quoted {
  value: string;
  quote: string;
}

export interface Extraction {
  job_title: Quoted | null;
  company: Quoted | null;
  location: Quoted | null;
  employment_type: Quoted | null;
  work_arrangement: Quoted | null;
  compensation: Quoted | null;
  deadline: (Quoted & { parsed_date: string | null }) | null;
  required_skills: Quoted[];
  education: Quoted[];
  experience: Quoted[];
  responsibilities: Quoted[];
  mandatory_requirements: Quoted[];
  preferred_qualifications: Quoted[];
  eligibility_criteria: Quoted[];
  benefits: Quoted[];
  required_documents: Quoted[];
  application_instructions: Quoted[];
}

export interface DiscardedValue {
  field: string;
  value: string;
  reason: string;
}

export interface ReviewedData {
  job_title: string | null;
  company: string | null;
  location: string | null;
  employment_type: string | null;
  work_arrangement: string | null;
  compensation: string | null;
  deadline_text: string | null;
  deadline: string | null;
  required_skills: string[];
  education: string[];
  experience: string[];
  responsibilities: string[];
  mandatory_requirements: string[];
  preferred_qualifications: string[];
  eligibility_criteria: string[];
  benefits: string[];
  required_documents: string[];
  application_instructions: string[];
}

export type AsyncStatus = "queued" | "processing" | "succeeded" | "failed";

export interface JobDescription {
  id: string;
  source_type: "paste" | "upload";
  original_text: string;
  text_source: "" | "paste" | "file" | "paste_supplement";
  has_text: boolean;
  has_file: boolean;
  original_filename: string;
  original_file_mime: string;
  original_file_size: number | null;
  original_file_sha256: string;
  extraction_status: "not_started" | AsyncStatus;
  extraction_error: string;
  extracted_at: string | null;
  raw_ai_output: {
    model: string;
    prompt_version: string;
    output: Extraction;
    discarded: DiscardedValue[];
  } | null;
  reviewed_data: ReviewedData | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}
