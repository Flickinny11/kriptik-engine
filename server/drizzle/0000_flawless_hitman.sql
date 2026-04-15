CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"scope" text,
	"password" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "build_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"event_type" text NOT NULL,
	"event_data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"encrypted_tokens" jsonb NOT NULL,
	"provider_user_id" text,
	"provider_email" text,
	"status" text DEFAULT 'active',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"balance" integer NOT NULL,
	"description" text,
	"project_id" text,
	"stripe_session_id" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mcp_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"service_id" text NOT NULL,
	"mcp_server_url" text NOT NULL,
	"auth_server_issuer" text NOT NULL,
	"encrypted_tokens" jsonb NOT NULL,
	"encrypted_registration" jsonb,
	"status" text DEFAULT 'connected',
	"connected_at" timestamp with time zone DEFAULT now(),
	"last_refreshed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mcp_oauth_states" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"service_id" text NOT NULL,
	"mcp_server_url" text NOT NULL,
	"auth_server_issuer" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text,
	"code_verifier" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"resource" text,
	"scopes" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mcp_tool_caches" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"tools" jsonb NOT NULL,
	"cached_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mcp_tool_caches_service_id_unique" UNIQUE("service_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"project_id" text,
	"code_verifier" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "prism_graphs" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"project_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"nodes" jsonb NOT NULL,
	"edges" jsonb NOT NULL,
	"hubs" jsonb NOT NULL,
	"metadata" jsonb NOT NULL,
	"frontend_bundle_url" text,
	"backend_manifest" jsonb,
	"optimization_report" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "prism_node_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"graph_id" text NOT NULL,
	"node_id" text NOT NULL,
	"image_url" text,
	"atlas_url" text,
	"atlas_region" jsonb,
	"generated_code" text,
	"code_hash" text,
	"verification_score" real,
	"caption_verified" boolean DEFAULT false,
	"generation_attempts" integer DEFAULT 1,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "prism_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"prompt" text NOT NULL,
	"parsed_intent" jsonb NOT NULL,
	"competitive_analysis" jsonb,
	"inferred_needs" jsonb,
	"graph_plan" jsonb NOT NULL,
	"backend_contract" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"total_cost" integer,
	"generation_time_ms" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_service_instances" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"service_id" text NOT NULL,
	"instance_model" text NOT NULL,
	"label" text,
	"status" text DEFAULT 'active',
	"environment" text DEFAULT 'development',
	"external_id" text,
	"api_key_masked" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"owner_id" text NOT NULL,
	"status" text DEFAULT 'idle',
	"engine_session_id" text,
	"brain_db_path" text,
	"sandbox_path" text,
	"app_slug" text,
	"is_published" boolean DEFAULT false,
	"published_at" timestamp with time zone,
	"published_version" integer DEFAULT 0,
	"custom_domain" text,
	"preview_url" text,
	"last_accessed_at" timestamp with time zone,
	"engine_type" text DEFAULT 'cortex' NOT NULL,
	"prism_config" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"email_verified" boolean DEFAULT false,
	"image" text,
	"slug" text,
	"credits" integer DEFAULT 500,
	"tier" text DEFAULT 'free',
	"stripe_customer_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_events" ADD CONSTRAINT "build_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_connections" ADD CONSTRAINT "mcp_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prism_graphs" ADD CONSTRAINT "prism_graphs_plan_id_prism_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."prism_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prism_graphs" ADD CONSTRAINT "prism_graphs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prism_node_assets" ADD CONSTRAINT "prism_node_assets_graph_id_prism_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."prism_graphs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prism_plans" ADD CONSTRAINT "prism_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prism_plans" ADD CONSTRAINT "prism_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_service_instances" ADD CONSTRAINT "project_service_instances_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_service_instances" ADD CONSTRAINT "project_service_instances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_build_events_project_id" ON "build_events" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credentials_user_project_provider" ON "credentials" USING btree ("user_id","project_id","provider_id");--> statement-breakpoint
CREATE INDEX "idx_credit_transactions_user_id" ON "credit_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_connections_user_service" ON "mcp_connections" USING btree ("user_id","service_id");--> statement-breakpoint
CREATE INDEX "idx_mcp_connections_user_id" ON "mcp_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_mcp_tool_caches_service" ON "mcp_tool_caches" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "idx_prism_graphs_project" ON "prism_graphs" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_prism_graphs_project_version" ON "prism_graphs" USING btree ("project_id","version");--> statement-breakpoint
CREATE INDEX "idx_prism_node_assets_graph" ON "prism_node_assets" USING btree ("graph_id");--> statement-breakpoint
CREATE INDEX "idx_prism_plans_project" ON "prism_plans" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_service_instances_project_service" ON "project_service_instances" USING btree ("project_id","service_id");--> statement-breakpoint
CREATE INDEX "idx_project_service_instances_project" ON "project_service_instances" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_service_instances_user" ON "project_service_instances" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_app_slug_unique" ON "projects" USING btree ("app_slug");