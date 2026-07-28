param(
  [Parameter(Mandatory = $true)]
  [string]$Mode,
  [Parameter(Mandatory = $true)]
  [string]$ConnectionString,
  [string]$AccountName,
  [string]$Password,
  [int]$AccountId = 0,
  [int]$AccountType = 0
)

function Escape-SqlLiteral {
  param([string]$Value)

  if ($null -eq $Value) {
    return ""
  }

  return $Value.Replace("'", "''")
}

function Convert-RecordsetToObject {
  param($Recordset)

  if ($Recordset.EOF) {
    return $null
  }

  $result = @{}
  for ($index = 0; $index -lt $Recordset.Fields.Count; $index++) {
    $field = $Recordset.Fields.Item($index)
    $result[$field.Name] = $field.Value
  }

  return $result
}

$connection = $null
$recordset = $null

try {
  $connection = New-Object -ComObject ADODB.Connection
  $connection.Open($ConnectionString)

  switch ($Mode) {
    "get-by-name" {
      $safeAccountName = Escape-SqlLiteral $AccountName
      $query = "SET NOCOUNT ON; SELECT TOP 1 AccountUniqueNumber, AccountName, Password, AccountType FROM dbo.td_Account WITH (NOLOCK) WHERE AccountName = '$safeAccountName' ORDER BY AccountUniqueNumber DESC"
      $recordset = $connection.Execute($query)
      $result = Convert-RecordsetToObject $recordset
      if ($null -eq $result) {
        Write-Output "null"
      } else {
        $result | ConvertTo-Json -Compress
      }
      break
    }
    "get-by-id" {
      $query = "SET NOCOUNT ON; SELECT TOP 1 AccountUniqueNumber, AccountName, Password, AccountType FROM dbo.td_Account WITH (NOLOCK) WHERE AccountUniqueNumber = $AccountId"
      $recordset = $connection.Execute($query)
      $result = Convert-RecordsetToObject $recordset
      if ($null -eq $result) {
        Write-Output "null"
      } else {
        $result | ConvertTo-Json -Compress
      }
      break
    }
    "insert-account" {
      $safeAccountName = Escape-SqlLiteral $AccountName
      $safePassword = Escape-SqlLiteral $Password
      $query = @"
SET NOCOUNT ON;
INSERT INTO dbo.td_Account(AccountName, Password, AccountType)
VALUES('$safeAccountName', '$safePassword', $AccountType);
SELECT TOP 1 AccountUniqueNumber, AccountName, Password, AccountType
FROM dbo.td_Account WITH (NOLOCK)
WHERE AccountName = '$safeAccountName'
ORDER BY AccountUniqueNumber DESC;
"@
      $recordset = $connection.Execute($query)
      (Convert-RecordsetToObject $recordset) | ConvertTo-Json -Compress
      break
    }
    "update-password" {
      $safeAccountName = Escape-SqlLiteral $AccountName
      $safePassword = Escape-SqlLiteral $Password
      $query = @"
SET NOCOUNT ON;
UPDATE dbo.td_Account
SET Password = '$safePassword'
WHERE AccountName = '$safeAccountName';
SELECT TOP 1 AccountUniqueNumber, AccountName, Password, AccountType
FROM dbo.td_Account WITH (NOLOCK)
WHERE AccountName = '$safeAccountName'
ORDER BY AccountUniqueNumber DESC;
"@
      $recordset = $connection.Execute($query)
      (Convert-RecordsetToObject $recordset) | ConvertTo-Json -Compress
      break
    }
    default {
      throw "Unsupported mode: $Mode"
    }
  }
} catch {
  Write-Error $_.Exception.Message
  exit 1
} finally {
  if ($null -ne $recordset) {
    try { $recordset.Close() } catch {}
  }

  if ($null -ne $connection) {
    try { $connection.Close() } catch {}
  }
}
