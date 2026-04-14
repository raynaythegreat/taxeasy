use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccountType {
    Asset,
    Liability,
    Equity,
    Revenue,
    Expense,
}

impl AccountType {
    pub fn as_str(&self) -> &'static str {
        match self {
            AccountType::Asset => "asset",
            AccountType::Liability => "liability",
            AccountType::Equity => "equity",
            AccountType::Revenue => "revenue",
            AccountType::Expense => "expense",
        }
    }

    /// Normal balance: Assets, Expenses → Debit; Liabilities, Equity, Revenue → Credit.
    pub fn normal_balance_is_debit(&self) -> bool {
        matches!(self, AccountType::Asset | AccountType::Expense)
    }
}

impl std::str::FromStr for AccountType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "asset" => Ok(AccountType::Asset),
            "liability" => Ok(AccountType::Liability),
            "equity" => Ok(AccountType::Equity),
            "revenue" => Ok(AccountType::Revenue),
            "expense" => Ok(AccountType::Expense),
            other => Err(format!("unknown account type: {other}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub code: String,
    pub name: String,
    pub account_type: AccountType,
    pub parent_id: Option<String>,
    pub schedule_c_line: Option<String>,
    pub active: bool,
    pub sort_order: i32,
}

/// Seed row from coa_*.json
#[derive(Debug, Deserialize)]
pub struct AccountSeed {
    pub code: String,
    pub name: String,
    pub account_type: AccountType,
    pub parent_id: Option<String>,
    pub schedule_c_line: Option<String>,
    #[serde(default)]
    pub sort_order: i32,
}
