/**
 * Calendar sync adapter interface.
 * Default implementation uses Google Calendar OAuth.
 * Swap to Outlook Calendar or CalDAV by implementing this interface.
 */
export interface CalendarAdapter {
  /** Create a calendar event for a booking */
  createEvent(options: CalendarEventOptions): Promise<CalendarEventResult>;
  /** Update an existing calendar event */
  updateEvent(eventId: string, options: Partial<CalendarEventOptions>): Promise<CalendarEventResult>;
  /** Delete a calendar event */
  deleteEvent(eventId: string): Promise<void>;
  /** Get conflicts (busy times) from external calendar */
  getConflicts(timeMin: Date, timeMax: Date): Promise<CalendarConflict[]>;
}

/** Options for creating/updating a calendar event */
export interface CalendarEventOptions {
  /** Event title */
  title: string;
  /** Event description/notes */
  description?: string;
  /** Event start time */
  startsAt: Date;
  /** Event end time */
  endsAt: Date;
  /** Event location */
  location?: string;
  /** Attendee email addresses */
  attendees?: string[];
  /** Provider's timezone */
  timezone?: string;
}

/** Result of creating/updating a calendar event */
export interface CalendarEventResult {
  /** External calendar event ID */
  eventId: string;
  /** Link to the calendar event */
  eventUrl?: string;
}

/** A busy time period from an external calendar */
export interface CalendarConflict {
  /** Start of busy period */
  start: Date;
  /** End of busy period */
  end: Date;
}
