-- Make ad_accounts platform-aware so Google Ads can sit beside Meta.
-- Existing rows are Meta by default, so this is safe to run on live data.
ALTER TABLE ad_accounts
  ADD COLUMN platform VARCHAR(16) NOT NULL DEFAULT 'META';

-- Uniqueness moves from the account id alone to (platform, account id):
-- two platforms could in principle issue the same numeric id.
DROP INDEX uq_ad_accounts_account ON ad_accounts;

CREATE UNIQUE INDEX uq_ad_accounts_platform_account
  ON ad_accounts (platform, account_id);
