/// Single source of truth for fiscal-aware report period ranges.
///
/// All period bounds are **half-open** `[start, end)` — the `end` date is
/// exclusive.  Callers pass `end` directly to SQL queries as `t.txn_date < ?`.
///
/// Balance Sheet uses `<= as_of_date` semantics and calls `get_balance_sheet`
/// directly with a single date rather than going through this command.
use chrono::{Datelike, NaiveDate};
use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::{
    error::{AppError, Result},
    state::AppState,
};

/// A half-open date range `[start, end)`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeriodRange {
    /// First day included in the period (ISO-8601 "YYYY-MM-DD").
    pub start: String,
    /// First day NOT included in the period (ISO-8601 "YYYY-MM-DD").
    pub end: String,
}

/// The set of named period types the frontend can request.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PeriodType {
    /// Jan 1 – Jan 1 of next year (calendar year, ignores fiscal_year_start_month).
    ThisYear,
    /// The current fiscal year up to and including today.
    Ytd,
    /// Full current fiscal year.
    TaxYear,
    /// Full previous fiscal year.
    LastTaxYear,
    /// Current calendar quarter.
    Quarter,
    /// Current calendar month.
    ThisMonth,
    /// Previous calendar month.
    LastMonth,
    /// Caller-supplied half-open range; returned unchanged.
    Custom { start: String, end: String },
}

/// Compute a half-open `[start, end)` range for the requested period type.
///
/// `anchor_date` is "YYYY-MM-DD" — used as "today" for relative periods.
/// Pass today's date from the frontend so the backend and frontend agree.
#[tauri::command(rename_all = "camelCase")]
pub fn report_period_for(
    client_id: String,
    period_type: PeriodType,
    anchor_date: String,
    state: tauri::State<AppState>,
) -> Result<PeriodRange> {
    let anchor = NaiveDate::parse_from_str(&anchor_date, "%Y-%m-%d")
        .map_err(|_| AppError::Validation(format!("invalid anchor_date: {anchor_date}")))?;

    let fiscal_start_month: u32 = {
        let app_lock = state.app_db.lock().unwrap();
        let db = app_lock.as_ref().ok_or(AppError::NoActiveClient)?;
        db.conn()
            .query_row(
                "SELECT fiscal_year_start_month FROM clients WHERE id = ?1",
                params![client_id],
                |row| row.get::<_, u32>(0),
            )
            .unwrap_or(1)
    };

    let range = compute_range(period_type, anchor, fiscal_start_month)?;
    Ok(range)
}

/// Pure computation — separated from the Tauri command for testability.
pub(crate) fn compute_range(
    period_type: PeriodType,
    anchor: NaiveDate,
    fiscal_start_month: u32,
) -> Result<PeriodRange> {
    let fsm = fiscal_start_month.clamp(1, 12);
    let range = match period_type {
        PeriodType::Custom { start, end } => PeriodRange { start, end },

        PeriodType::ThisYear => {
            let y = anchor.year();
            PeriodRange {
                start: format!("{y}-01-01"),
                end: format!("{}-01-01", y + 1),
            }
        }

        PeriodType::ThisMonth => {
            let start = NaiveDate::from_ymd_opt(anchor.year(), anchor.month(), 1)
                .ok_or_else(|| AppError::Validation("invalid date".into()))?;
            let end = next_month_start(start)?;
            PeriodRange {
                start: start.format("%Y-%m-%d").to_string(),
                end: end.format("%Y-%m-%d").to_string(),
            }
        }

        PeriodType::LastMonth => {
            let this_month_start = NaiveDate::from_ymd_opt(anchor.year(), anchor.month(), 1)
                .ok_or_else(|| AppError::Validation("invalid date".into()))?;
            let last_month_start = prev_month_start(this_month_start)?;
            PeriodRange {
                start: last_month_start.format("%Y-%m-%d").to_string(),
                end: this_month_start.format("%Y-%m-%d").to_string(),
            }
        }

        PeriodType::Quarter => {
            // Calendar quarters: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec.
            let m = anchor.month();
            let q_start_month = ((m - 1) / 3) * 3 + 1;
            let start = NaiveDate::from_ymd_opt(anchor.year(), q_start_month, 1)
                .ok_or_else(|| AppError::Validation("invalid date".into()))?;
            let end = {
                let next = q_start_month + 3;
                if next > 12 {
                    NaiveDate::from_ymd_opt(anchor.year() + 1, next - 12, 1)
                } else {
                    NaiveDate::from_ymd_opt(anchor.year(), next, 1)
                }
                .ok_or_else(|| AppError::Validation("invalid date".into()))?
            };
            PeriodRange {
                start: start.format("%Y-%m-%d").to_string(),
                end: end.format("%Y-%m-%d").to_string(),
            }
        }

        PeriodType::Ytd => {
            let fy_start = fiscal_year_start(anchor, fsm);
            // end = day after anchor so anchor itself is included.
            let end = anchor
                .succ_opt()
                .ok_or_else(|| AppError::Validation("date overflow".into()))?;
            PeriodRange {
                start: fy_start.format("%Y-%m-%d").to_string(),
                end: end.format("%Y-%m-%d").to_string(),
            }
        }

        PeriodType::TaxYear => {
            let fy_start = fiscal_year_start(anchor, fsm);
            let fy_end = fiscal_year_end_exclusive(fy_start, fsm);
            PeriodRange {
                start: fy_start.format("%Y-%m-%d").to_string(),
                end: fy_end.format("%Y-%m-%d").to_string(),
            }
        }

        PeriodType::LastTaxYear => {
            let this_fy_start = fiscal_year_start(anchor, fsm);
            // "last tax year" start = same month/day, one year earlier.
            let last_fy_start = NaiveDate::from_ymd_opt(this_fy_start.year() - 1, fsm, 1)
                .ok_or_else(|| AppError::Validation("date overflow".into()))?;
            let last_fy_end = fiscal_year_end_exclusive(last_fy_start, fsm);
            PeriodRange {
                start: last_fy_start.format("%Y-%m-%d").to_string(),
                end: last_fy_end.format("%Y-%m-%d").to_string(),
            }
        }
    };
    Ok(range)
}

// ── Date helpers ──────────────────────────────────────────────────────────────

/// Return the start of the fiscal year containing `date`.
/// Fiscal year N starts on YYYY-fsm-01 where YYYY is the calendar year
/// such that YYYY-fsm-01 <= date < (YYYY+1)-fsm-01.
fn fiscal_year_start(date: NaiveDate, fsm: u32) -> NaiveDate {
    let m = date.month();
    let y = date.year();
    let fy_year = if m >= fsm { y } else { y - 1 };
    NaiveDate::from_ymd_opt(fy_year, fsm, 1).unwrap_or(date)
}

/// Return the exclusive end of the fiscal year that starts at `fy_start`.
fn fiscal_year_end_exclusive(fy_start: NaiveDate, fsm: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(fy_start.year() + 1, fsm, 1)
        .unwrap_or_else(|| fy_start + chrono::Duration::days(366))
}

/// Return the first day of the month following `date`'s month.
fn next_month_start(date: NaiveDate) -> Result<NaiveDate> {
    let (y, m) = if date.month() == 12 {
        (date.year() + 1, 1)
    } else {
        (date.year(), date.month() + 1)
    };
    NaiveDate::from_ymd_opt(y, m, 1)
        .ok_or_else(|| AppError::Validation("date overflow in next_month_start".into()))
}

/// Return the first day of the month before `date`'s month.
fn prev_month_start(date: NaiveDate) -> Result<NaiveDate> {
    let (y, m) = if date.month() == 1 {
        (date.year() - 1, 12)
    } else {
        (date.year(), date.month() - 1)
    };
    NaiveDate::from_ymd_opt(y, m, 1)
        .ok_or_else(|| AppError::Validation("date overflow in prev_month_start".into()))
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn nd(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    fn range(period: PeriodType, anchor: &str, fsm: u32) -> PeriodRange {
        compute_range(period, nd(anchor), fsm).unwrap()
    }

    // ── TaxYear ───────────────────────────────────────────────────────────────

    #[test]
    fn tax_year_jan_fiscal_is_calendar_year() {
        let r = range(PeriodType::TaxYear, "2024-06-15", 1);
        assert_eq!(r.start, "2024-01-01");
        assert_eq!(r.end, "2025-01-01");
    }

    #[test]
    fn tax_year_apr_fiscal_mid_year() {
        // Apr fiscal; anchor in Sep 2024 → FY starts Apr 2024
        let r = range(PeriodType::TaxYear, "2024-09-01", 4);
        assert_eq!(r.start, "2024-04-01");
        assert_eq!(r.end, "2025-04-01");
    }

    #[test]
    fn tax_year_apr_fiscal_before_start_month() {
        // Apr fiscal; anchor in Feb 2025 → FY started Apr 2024
        let r = range(PeriodType::TaxYear, "2025-02-01", 4);
        assert_eq!(r.start, "2024-04-01");
        assert_eq!(r.end, "2025-04-01");
    }

    #[test]
    fn last_tax_year_jan_fiscal() {
        let r = range(PeriodType::LastTaxYear, "2024-11-01", 1);
        assert_eq!(r.start, "2023-01-01");
        assert_eq!(r.end, "2024-01-01");
    }

    #[test]
    fn last_tax_year_apr_fiscal() {
        // anchor Feb 2025 → this FY = Apr 2024..Apr 2025 → last FY = Apr 2023..Apr 2024
        let r = range(PeriodType::LastTaxYear, "2025-02-15", 4);
        assert_eq!(r.start, "2023-04-01");
        assert_eq!(r.end, "2024-04-01");
    }

    // ── Ytd ───────────────────────────────────────────────────────────────────

    #[test]
    fn ytd_includes_anchor_day() {
        let r = range(PeriodType::Ytd, "2024-03-15", 1);
        assert_eq!(r.start, "2024-01-01");
        assert_eq!(r.end, "2024-03-16"); // exclusive, so Mar 15 is included
    }

    #[test]
    fn ytd_apr_fiscal_before_start_wraps_year() {
        // anchor Feb 2025, Apr fiscal → FY started Apr 2024
        let r = range(PeriodType::Ytd, "2025-02-10", 4);
        assert_eq!(r.start, "2024-04-01");
        assert_eq!(r.end, "2025-02-11");
    }

    // ── Half-open boundary correctness ────────────────────────────────────────

    #[test]
    fn adjacent_quarters_do_not_overlap() {
        // Q1 end == Q2 start (no overlap, no gap)
        let q1 = range(PeriodType::Quarter, "2024-03-31", 1);
        let q2 = range(PeriodType::Quarter, "2024-04-01", 1);
        assert_eq!(q1.end, q2.start);
    }

    #[test]
    fn adjacent_months_do_not_overlap() {
        let jan = range(PeriodType::ThisMonth, "2024-01-31", 1);
        let feb = range(PeriodType::ThisMonth, "2024-02-01", 1);
        assert_eq!(jan.end, feb.start);
    }

    // ── Leap year ─────────────────────────────────────────────────────────────

    #[test]
    fn leap_year_feb29_in_ytd() {
        let r = range(PeriodType::Ytd, "2024-02-29", 1);
        assert_eq!(r.start, "2024-01-01");
        assert_eq!(r.end, "2024-03-01"); // Feb 29 is included, end = Mar 1
    }

    #[test]
    fn this_month_feb_leap_year() {
        let r = range(PeriodType::ThisMonth, "2024-02-29", 1);
        assert_eq!(r.start, "2024-02-01");
        assert_eq!(r.end, "2024-03-01");
    }

    // ── ThisMonth / LastMonth ─────────────────────────────────────────────────

    #[test]
    fn this_month_jan() {
        let r = range(PeriodType::ThisMonth, "2024-01-15", 1);
        assert_eq!(r.start, "2024-01-01");
        assert_eq!(r.end, "2024-02-01");
    }

    #[test]
    fn last_month_crosses_year_boundary() {
        let r = range(PeriodType::LastMonth, "2024-01-10", 1);
        assert_eq!(r.start, "2023-12-01");
        assert_eq!(r.end, "2024-01-01");
    }

    // ── Quarter ───────────────────────────────────────────────────────────────

    #[test]
    fn quarter_q4_end_is_jan_1() {
        let r = range(PeriodType::Quarter, "2024-12-15", 1);
        assert_eq!(r.start, "2024-10-01");
        assert_eq!(r.end, "2025-01-01");
    }

    // ── Custom passthrough ────────────────────────────────────────────────────

    #[test]
    fn custom_returns_unchanged() {
        let r = range(
            PeriodType::Custom {
                start: "2023-04-01".into(),
                end: "2024-04-01".into(),
            },
            "2024-01-01",
            1,
        );
        assert_eq!(r.start, "2023-04-01");
        assert_eq!(r.end, "2024-04-01");
    }

    // ── Multiple fiscal_start_month values ────────────────────────────────────

    #[test]
    fn all_start_months_produce_valid_ranges() {
        for fsm in 1u32..=12 {
            let r = compute_range(PeriodType::TaxYear, nd("2024-07-04"), fsm).unwrap();
            let start = nd(&r.start);
            let end = nd(&r.end);
            // end > start
            assert!(end > start, "fsm={fsm}: end {end} <= start {start}");
            // span is exactly 1 year
            let expected_end = NaiveDate::from_ymd_opt(start.year() + 1, start.month(), 1).unwrap();
            assert_eq!(end, expected_end, "fsm={fsm}");
        }
    }
}
