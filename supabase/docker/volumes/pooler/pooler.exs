Application.ensure_all_started(:supavisor)

{:ok, %{rows: [[version]]}} =
  Ecto.Adapters.SQL.query(Supavisor.Repo, "select version()")

[pg_version] =
  Regex.run(~r/PostgreSQL (\d+\.\d+)/, version, capture: :all_but_first)

params = %{
  "external_id" => System.get_env("POOLER_TENANT_ID"),
  "db_host" => "db",
  "db_port" => System.get_env("POSTGRES_PORT"),
  "db_database" => System.get_env("POSTGRES_DB"),
  "require_user" => false,
  "auth_query" => "SELECT * FROM pgbouncer.get_auth($1)",
  "default_max_clients" => String.to_integer(System.get_env("POOLER_MAX_CLIENT_CONN", "100")),
  "default_pool_size" => String.to_integer(System.get_env("POOLER_DEFAULT_POOL_SIZE", "20")),
  "ip_version" => "auto",
  "upstream_tls_ca" => nil,
  "enforce_ssl" => false,
  "upstream_verify" => "none",
  "upstream_ssl" => false,
  "pg_version" => pg_version,
  "users" => [
    %{
      "db_user" => "pgbouncer",
      "db_password" => System.get_env("POSTGRES_PASSWORD"),
      "pool_size" => String.to_integer(System.get_env("POOLER_DEFAULT_POOL_SIZE", "20")),
      "mode_type" => System.get_env("POOLER_POOL_MODE", "transaction"),
      "is_manager" => true
    }
  ]
}

case Supavisor.Tenants.get_tenant_by_external_id(params["external_id"]) do
  nil -> Supavisor.Tenants.create_tenant(params)
  _tenant -> :ok
end
