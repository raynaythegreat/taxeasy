use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Schedule C mapping between a COA account and a Schedule C line item.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleCMapping {
    pub id: String,
    pub client_id: String,
    pub account_id: String,
    pub schedule_c_line: String,
    pub is_custom: bool,
    pub created_at: String,
    // Joined from accounts table
    pub account_name: String,
    pub account_type: String,
}

/// Schedule C summary for a tax year.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleCSummary {
    pub tax_year: i32,
    pub gross_receipts: i64,
    pub returns_and_allowances: i64,
    pub cost_of_goods_sold: i64,
    pub gross_profit: i64,
    pub other_income: i64,
    pub gross_income: i64,
    pub expenses_by_line: HashMap<String, i64>,
    pub total_expenses: i64,
    pub tentative_profit: i64,
}
