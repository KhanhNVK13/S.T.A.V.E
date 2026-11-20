-- Adds fixed 7-day and 30-day engagement counts and scores to project_engagement
-- (existing columns keep their order and meaning) so rankings can be filtered by period.
CREATE OR REPLACE VIEW public.project_engagement AS
 WITH cfg AS (
         SELECT COALESCE(( SELECT (s.value #>> '{}'::text[])::numeric AS "numeric"
                   FROM platform_settings s
                  WHERE s.key = 'ranking_weight_play'::text), 1::numeric) AS w_play,
            COALESCE(( SELECT (s.value #>> '{}'::text[])::numeric AS "numeric"
                   FROM platform_settings s
                  WHERE s.key = 'ranking_weight_fork'::text), 5::numeric) AS w_fork,
            COALESCE(( SELECT (s.value #>> '{}'::text[])::numeric AS "numeric"
                   FROM platform_settings s
                  WHERE s.key = 'ranking_weight_comment'::text), 3::numeric) AS w_comment,
            now() - make_interval(days => COALESCE(( SELECT (s.value #>> '{}'::text[])::integer AS int4
                   FROM platform_settings s
                  WHERE s.key = 'ranking_window_days'::text), 7)) AS since,
            now() - interval '7 days' AS since_week,
            now() - interval '30 days' AS since_month
        ), plays AS (
         SELECT pp.project_id,
            count(DISTINCT pp.user_id)::integer AS total,
            count(DISTINCT pp.user_id) FILTER (WHERE pp.created_at >= (( SELECT cfg_1.since FROM cfg cfg_1)))::integer AS recent,
            count(DISTINCT pp.user_id) FILTER (WHERE pp.created_at >= (( SELECT cfg_1.since_week FROM cfg cfg_1)))::integer AS week,
            count(DISTINCT pp.user_id) FILTER (WHERE pp.created_at >= (( SELECT cfg_1.since_month FROM cfg cfg_1)))::integer AS month
           FROM project_plays pp
             JOIN projects p_1 ON p_1.id = pp.project_id
             JOIN users u ON u.id = pp.user_id AND u.status = 'active'::user_status_enum
          WHERE pp.user_id <> p_1.owner_id
          GROUP BY pp.project_id
        ), forks AS (
         SELECT f.forked_from_project_id AS project_id,
            count(DISTINCT f.owner_id)::integer AS total,
            count(DISTINCT f.owner_id) FILTER (WHERE f.created_at >= (( SELECT cfg_1.since FROM cfg cfg_1)))::integer AS recent,
            count(DISTINCT f.owner_id) FILTER (WHERE f.created_at >= (( SELECT cfg_1.since_week FROM cfg cfg_1)))::integer AS week,
            count(DISTINCT f.owner_id) FILTER (WHERE f.created_at >= (( SELECT cfg_1.since_month FROM cfg cfg_1)))::integer AS month
           FROM projects f
             JOIN projects p_1 ON p_1.id = f.forked_from_project_id
             JOIN users u ON u.id = f.owner_id AND u.status = 'active'::user_status_enum
          WHERE f.owner_id <> p_1.owner_id
          GROUP BY f.forked_from_project_id
        ), remarks AS (
         SELECT c.project_id,
            count(DISTINCT c.author_id)::integer AS total,
            count(DISTINCT c.author_id) FILTER (WHERE c.created_at >= (( SELECT cfg_1.since FROM cfg cfg_1)))::integer AS recent,
            count(DISTINCT c.author_id) FILTER (WHERE c.created_at >= (( SELECT cfg_1.since_week FROM cfg cfg_1)))::integer AS week,
            count(DISTINCT c.author_id) FILTER (WHERE c.created_at >= (( SELECT cfg_1.since_month FROM cfg cfg_1)))::integer AS month
           FROM comments c
             JOIN projects p_1 ON p_1.id = c.project_id
             JOIN users u ON u.id = c.author_id AND u.status = 'active'::user_status_enum
          WHERE c.author_id <> p_1.owner_id
          GROUP BY c.project_id
        )
 SELECT p.id AS project_id,
    p.name,
    p.genre,
    p.created_at,
    p.visibility = 'public'::visibility_enum AND p.archived_at IS NULL AND p.moderation_hidden_at IS NULL AND o.status = 'active'::user_status_enum AS is_visible,
    COALESCE(pl.total, 0) AS plays,
    COALESCE(fk.total, 0) AS forks,
    COALESCE(rm.total, 0) AS comments,
    cfg.w_play * COALESCE(pl.total, 0)::numeric + cfg.w_fork * COALESCE(fk.total, 0)::numeric + cfg.w_comment * COALESCE(rm.total, 0)::numeric AS score_all,
    cfg.w_play * COALESCE(pl.recent, 0)::numeric + cfg.w_fork * COALESCE(fk.recent, 0)::numeric + cfg.w_comment * COALESCE(rm.recent, 0)::numeric AS score_recent,
    (cfg.w_play * COALESCE(pl.recent, 0)::numeric + cfg.w_fork * COALESCE(fk.recent, 0)::numeric + cfg.w_comment * COALESCE(rm.recent, 0)::numeric) / ln(cfg.w_play * COALESCE(pl.total, 0)::numeric + cfg.w_fork * COALESCE(fk.total, 0)::numeric + cfg.w_comment * COALESCE(rm.total, 0)::numeric + 10::numeric) AS trending_score,
    p.instruments,
    COALESCE(pl.week, 0) AS plays_week,
    COALESCE(pl.month, 0) AS plays_month,
    COALESCE(fk.week, 0) AS forks_week,
    COALESCE(fk.month, 0) AS forks_month,
    cfg.w_play * COALESCE(pl.week, 0)::numeric + cfg.w_fork * COALESCE(fk.week, 0)::numeric + cfg.w_comment * COALESCE(rm.week, 0)::numeric AS score_week,
    cfg.w_play * COALESCE(pl.month, 0)::numeric + cfg.w_fork * COALESCE(fk.month, 0)::numeric + cfg.w_comment * COALESCE(rm.month, 0)::numeric AS score_month
   FROM projects p
     JOIN users o ON o.id = p.owner_id
     CROSS JOIN cfg
     LEFT JOIN plays pl ON pl.project_id = p.id
     LEFT JOIN forks fk ON fk.project_id = p.id
     LEFT JOIN remarks rm ON rm.project_id = p.id;
