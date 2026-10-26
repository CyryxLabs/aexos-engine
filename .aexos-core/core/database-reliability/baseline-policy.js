'use strict';

const { digest } = require('../execution/durable-evidence');

const INTERNAL_FAMILY_IS_UNSAFE = `EXISTS (
  SELECT 1 FROM pg_catalog.pg_amproc amp
  JOIN pg_catalog.pg_proc p ON p.oid = amp.amproc
  JOIN pg_catalog.pg_namespace pn ON pn.oid = p.pronamespace
  JOIN pg_catalog.pg_language pl ON pl.oid = p.prolang
  WHERE amp.amprocfamily = opc.opcfamily
    AND (pn.nspname <> 'pg_catalog' OR pl.lanname <> 'internal'))
  OR EXISTS (
  SELECT 1 FROM pg_catalog.pg_amop amo
  JOIN pg_catalog.pg_operator op ON op.oid = amo.amopopr
  JOIN pg_catalog.pg_namespace opn2 ON opn2.oid = op.oprnamespace
  JOIN pg_catalog.pg_proc p ON p.oid = op.oprcode
  JOIN pg_catalog.pg_namespace pn ON pn.oid = p.pronamespace
  JOIN pg_catalog.pg_language pl ON pl.oid = p.prolang
  WHERE amo.amopfamily = opc.opcfamily
    AND (opn2.nspname <> 'pg_catalog' OR pn.nspname <> 'pg_catalog' OR pl.lanname <> 'internal'))`;

const PLAN_BASELINE_SQL = `SELECT n.nspname AS schema_name, c.relname AS table_name,
  n.oid::text AS namespace_oid, c.oid::text AS relation_oid,
  c.relkind, c.relrowsecurity, c.relispartition, c.relam::text AS relation_am_oid,
  EXISTS (SELECT 1 FROM pg_catalog.pg_inherits inh
    WHERE inh.inhrelid = c.oid OR inh.inhparent = c.oid) AS has_inheritance,
  EXISTS (SELECT 1 FROM pg_catalog.pg_rewrite rw
    WHERE rw.ev_class = c.oid AND rw.rulename <> '_RETURN') AS has_rules,
  EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.oid
    AND a.attnum > 0 AND NOT a.attisdropped
    AND (a.atttypid <> 'pg_catalog.int4'::pg_catalog.regtype
      OR a.attgenerated <> '' OR a.attcollation <> 0)) AS has_unsafe_column,
  EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.oid
    AND a.attnum > 0 AND NOT a.attisdropped AND a.atthasdef) AS has_default,
  EXISTS (SELECT 1 FROM pg_catalog.pg_constraint con WHERE con.conrelid = c.oid
    AND (con.contype <> 'p' OR con.conkey <> ARRAY[1]::smallint[] OR NOT con.convalidated
      OR con.condeferrable OR con.condeferred OR con.conparentid <> 0 OR con.conbin IS NOT NULL))
    AS has_unsafe_constraint,
  EXISTS (SELECT 1 FROM pg_catalog.pg_index i WHERE i.indrelid = c.oid
    AND (NOT i.indisvalid OR NOT i.indisready OR NOT i.indislive
      OR i.indnkeyatts <> i.indnatts OR i.indexprs IS NOT NULL OR i.indpred IS NOT NULL))
    AS has_unsafe_index,
  EXISTS (SELECT 1 FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid
    JOIN pg_catalog.pg_am am ON am.oid = ic.relam
    JOIN pg_catalog.pg_proc hp ON hp.oid = am.amhandler
    JOIN pg_catalog.pg_namespace hn ON hn.oid = hp.pronamespace
    JOIN pg_catalog.pg_language hl ON hl.oid = hp.prolang
    WHERE i.indrelid = c.oid AND (am.amname <> 'btree' OR hn.nspname <> 'pg_catalog'
      OR hp.proname <> 'bthandler' OR hl.lanname <> 'internal'))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_am am
      JOIN pg_catalog.pg_proc hp ON hp.oid = am.amhandler
      JOIN pg_catalog.pg_namespace hn ON hn.oid = hp.pronamespace
      JOIN pg_catalog.pg_language hl ON hl.oid = hp.prolang
      WHERE am.oid = c.relam AND (am.amname <> 'heap' OR hn.nspname <> 'pg_catalog'
        OR hp.proname <> 'heap_tableam_handler' OR hl.lanname <> 'internal'))
    AS has_unsafe_access_method,
  EXISTS (SELECT 1 FROM pg_catalog.pg_index i
    JOIN LATERAL pg_catalog.generate_subscripts(i.indkey::smallint[], 1) pos ON pos < i.indnkeyatts
    LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid
      AND a.attnum = (i.indkey::smallint[])[pos]
    LEFT JOIN pg_catalog.pg_opclass opc ON opc.oid = (i.indclass::oid[])[pos]
    LEFT JOIN pg_catalog.pg_namespace opn ON opn.oid = opc.opcnamespace
    LEFT JOIN pg_catalog.pg_opfamily opf ON opf.oid = opc.opcfamily
    LEFT JOIN pg_catalog.pg_namespace ofn ON ofn.oid = opf.opfnamespace
    WHERE i.indrelid = c.oid AND (a.attnum IS NULL OR a.atttypid <> 'pg_catalog.int4'::pg_catalog.regtype
      OR (i.indcollation::oid[])[pos] <> 0 OR opn.nspname <> 'pg_catalog'
      OR opc.opcname <> 'int4_ops' OR opc.opcintype <> 'pg_catalog.int4'::pg_catalog.regtype
      OR ofn.nspname <> 'pg_catalog' OR (${INTERNAL_FAMILY_IS_UNSAFE}))) AS has_unsafe_opclass,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_operator op
    JOIN pg_catalog.pg_namespace opn ON opn.oid = op.oprnamespace
    JOIN pg_catalog.pg_proc p ON p.oid = op.oprcode
    JOIN pg_catalog.pg_namespace pn ON pn.oid = p.pronamespace
    JOIN pg_catalog.pg_language pl ON pl.oid = p.prolang
    WHERE op.oprname = '=' AND op.oprleft = 'pg_catalog.int4'::pg_catalog.regtype
      AND op.oprright = 'pg_catalog.int4'::pg_catalog.regtype AND opn.nspname = 'pg_catalog'
      AND pn.nspname = 'pg_catalog' AND pl.lanname = 'internal') AS has_unsafe_operator,
  (SELECT pg_catalog.md5(pg_catalog.string_agg(
    a.attnum::text || ':' || a.atttypid::text || ':' || a.attcollation::text || ':' ||
    a.attgenerated::text || ':' || a.atthasdef::text, ',' ORDER BY a.attnum))
    FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.oid
      AND a.attnum > 0 AND NOT a.attisdropped) AS column_identity,
  (SELECT pg_catalog.md5(pg_catalog.string_agg(
    i.indexrelid::text || ':' || ic.relam::text || ':' || i.indisvalid::text || ':' ||
    i.indisready::text || ':' || i.indislive::text || ':' || i.indnkeyatts::text || ':' ||
    i.indnatts::text || ':' || i.indkey::text || ':' || i.indclass::text || ':' ||
    i.indcollation::text || ':' || (i.indexprs IS NOT NULL)::text || ':' ||
    (i.indpred IS NOT NULL)::text, ',' ORDER BY i.indexrelid))
    FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid
    WHERE i.indrelid = c.oid) AS index_identity,
  (SELECT pg_catalog.md5(pg_catalog.string_agg(
    con.oid::text || ':' || con.contype::text || ':' || con.conkey::text || ':' ||
    con.convalidated::text || ':' || con.condeferrable::text || ':' || con.condeferred::text || ':' ||
    con.conparentid::text || ':' || (con.conbin IS NOT NULL)::text, ',' ORDER BY con.oid))
    FROM pg_catalog.pg_constraint con WHERE con.conrelid = c.oid) AS constraint_identity,
  (SELECT pg_catalog.md5(pg_catalog.string_agg(dependency, ',' ORDER BY dependency)) FROM (
    SELECT i.indexrelid::text || ':am:' || am.oid::text || ':handler:' || hp.oid::text AS dependency
      FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid
      JOIN pg_catalog.pg_am am ON am.oid = ic.relam JOIN pg_catalog.pg_proc hp ON hp.oid = am.amhandler
      WHERE i.indrelid = c.oid
    UNION ALL
    SELECT i.indexrelid::text || ':key:' || pos::text || ':opclass:' || opc.oid::text ||
      ':family:' || opc.opcfamily::text || ':collation:' || (i.indcollation::oid[])[pos]::text
      FROM pg_catalog.pg_index i
      JOIN LATERAL pg_catalog.generate_subscripts(i.indkey::smallint[], 1) pos ON pos < i.indnkeyatts
      JOIN pg_catalog.pg_opclass opc ON opc.oid = (i.indclass::oid[])[pos]
      WHERE i.indrelid = c.oid
    UNION ALL
    SELECT i.indexrelid::text || ':support:' || amp.amproc::text
      FROM pg_catalog.pg_index i
      JOIN LATERAL pg_catalog.generate_subscripts(i.indkey::smallint[], 1) pos ON pos < i.indnkeyatts
      JOIN pg_catalog.pg_opclass opc ON opc.oid = (i.indclass::oid[])[pos]
      JOIN pg_catalog.pg_amproc amp ON amp.amprocfamily = opc.opcfamily WHERE i.indrelid = c.oid
    UNION ALL
    SELECT i.indexrelid::text || ':operator:' || amo.amopopr::text
      FROM pg_catalog.pg_index i
      JOIN LATERAL pg_catalog.generate_subscripts(i.indkey::smallint[], 1) pos ON pos < i.indnkeyatts
      JOIN pg_catalog.pg_opclass opc ON opc.oid = (i.indclass::oid[])[pos]
      JOIN pg_catalog.pg_amop amo ON amo.amopfamily = opc.opcfamily WHERE i.indrelid = c.oid
  ) dependencies) AS index_dependency_identity
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE (n.nspname, c.relname) IN (('aexos_fixture', 'accounts'), ('aexos_fixture', 'events'))
  ORDER BY n.nspname, c.relname`;

const MIGRATION_BASELINE_SQL = `SELECT n.oid::text AS namespace_oid, c.oid::text AS relation_oid,
  c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.relispartition,
  c.relam::text AS relation_access_method_oid, am.amname AS relation_access_method,
  EXISTS (SELECT 1 FROM pg_catalog.pg_inherits inh WHERE inh.inhparent = c.oid) AS has_descendants,
  EXISTS (SELECT 1 FROM pg_catalog.pg_rewrite rw WHERE rw.ev_class = c.oid
    AND rw.rulename <> '_RETURN') AS has_rules,
  a.attnum, a.attname, a.atttypid::text AS type_oid, a.attcollation::text AS collation_oid,
  a.attnotnull, a.atthasdef, a.attgenerated,
  (a.attgenerated <> '' OR CASE a.attname
    WHEN 'manifest_ref' THEN a.atttypid <> 'pg_catalog.text'::pg_catalog.regtype
      OR a.attcollation <> 'pg_catalog.default'::pg_catalog.regcollation
    WHEN 'migration_id' THEN a.atttypid <> 'pg_catalog.text'::pg_catalog.regtype
      OR a.attcollation <> 'pg_catalog.default'::pg_catalog.regcollation
    WHEN 'migration_order' THEN a.atttypid <> 'pg_catalog.int4'::pg_catalog.regtype OR a.attcollation <> 0
    WHEN 'migration_hash' THEN a.atttypid <> 'pg_catalog.text'::pg_catalog.regtype
      OR a.attcollation <> 'pg_catalog.default'::pg_catalog.regcollation
    ELSE true END) AS has_unsafe_column,
  EXISTS (SELECT 1 FROM pg_catalog.pg_constraint con WHERE con.conrelid = c.oid
    AND (con.contype <> 'p' OR con.conkey <> ARRAY[1,2]::smallint[] OR NOT con.convalidated
      OR con.condeferrable OR con.condeferred OR con.conparentid <> 0 OR con.conbin IS NOT NULL))
    AS has_unsafe_constraint,
  EXISTS (SELECT 1 FROM pg_catalog.pg_index i WHERE i.indrelid = c.oid
    AND (NOT i.indisvalid OR NOT i.indisready OR NOT i.indislive
      OR i.indnkeyatts <> i.indnatts OR i.indexprs IS NOT NULL OR i.indpred IS NOT NULL))
    AS has_unsafe_index,
  EXISTS (SELECT 1 FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid
    JOIN pg_catalog.pg_am iam ON iam.oid = ic.relam
    JOIN pg_catalog.pg_proc hp ON hp.oid = iam.amhandler
    JOIN pg_catalog.pg_namespace hn ON hn.oid = hp.pronamespace
    JOIN pg_catalog.pg_language hl ON hl.oid = hp.prolang
    WHERE i.indrelid = c.oid AND (iam.amname <> 'btree' OR hn.nspname <> 'pg_catalog'
      OR hp.proname <> 'bthandler' OR hl.lanname <> 'internal')) AS has_unsafe_access_method,
  EXISTS (SELECT 1 FROM pg_catalog.pg_index i
    JOIN LATERAL pg_catalog.generate_subscripts(i.indkey::smallint[], 1) pos ON pos < i.indnkeyatts
    LEFT JOIN pg_catalog.pg_attribute ka ON ka.attrelid = i.indrelid
      AND ka.attnum = (i.indkey::smallint[])[pos]
    LEFT JOIN pg_catalog.pg_opclass opc ON opc.oid = (i.indclass::oid[])[pos]
    LEFT JOIN pg_catalog.pg_namespace opn ON opn.oid = opc.opcnamespace
    LEFT JOIN pg_catalog.pg_opfamily opf ON opf.oid = opc.opcfamily
    LEFT JOIN pg_catalog.pg_namespace ofn ON ofn.oid = opf.opfnamespace
    LEFT JOIN pg_catalog.pg_collation col ON col.oid = (i.indcollation::oid[])[pos]
    LEFT JOIN pg_catalog.pg_namespace coln ON coln.oid = col.collnamespace
    WHERE i.indrelid = c.oid AND (ka.attnum IS NULL OR opn.nspname <> 'pg_catalog'
      OR ofn.nspname <> 'pg_catalog' OR CASE ka.atttypid
        WHEN 'pg_catalog.text'::pg_catalog.regtype THEN opc.opcname <> 'text_ops'
          OR opc.opcintype <> 'pg_catalog.text'::pg_catalog.regtype
          OR (i.indcollation::oid[])[pos] <> ka.attcollation
          OR coln.nspname <> 'pg_catalog' OR col.collname <> 'default'
        WHEN 'pg_catalog.int4'::pg_catalog.regtype THEN opc.opcname <> 'int4_ops'
          OR opc.opcintype <> 'pg_catalog.int4'::pg_catalog.regtype
          OR (i.indcollation::oid[])[pos] <> 0
        ELSE true END OR (${INTERNAL_FAMILY_IS_UNSAFE}))) AS has_unsafe_opclass,
  (am.amname <> 'heap'
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_am ram
      JOIN pg_catalog.pg_proc hp ON hp.oid = ram.amhandler
      JOIN pg_catalog.pg_namespace hn ON hn.oid = hp.pronamespace
      JOIN pg_catalog.pg_language hl ON hl.oid = hp.prolang
      WHERE ram.oid = c.relam AND hn.nspname = 'pg_catalog'
        AND hp.proname = 'heap_tableam_handler' AND hl.lanname = 'internal')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_operator op
      JOIN pg_catalog.pg_namespace opn ON opn.oid = op.oprnamespace
      JOIN pg_catalog.pg_proc p ON p.oid = op.oprcode
      JOIN pg_catalog.pg_namespace pn ON pn.oid = p.pronamespace
      JOIN pg_catalog.pg_language pl ON pl.oid = p.prolang
      WHERE op.oprname = '=' AND op.oprleft = 'pg_catalog.text'::pg_catalog.regtype
        AND op.oprright = 'pg_catalog.text'::pg_catalog.regtype AND opn.nspname = 'pg_catalog'
        AND pn.nspname = 'pg_catalog' AND pl.lanname = 'internal')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace pn ON pn.oid = p.pronamespace
      JOIN pg_catalog.pg_language pl ON pl.oid = p.prolang
      WHERE pn.nspname = 'pg_catalog' AND p.proname = 'octet_length'
        AND p.proargtypes = '25'::pg_catalog.oidvector AND pl.lanname = 'internal')
    OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_opclass opc
      JOIN pg_catalog.pg_namespace opn ON opn.oid = opc.opcnamespace
      JOIN pg_catalog.pg_opfamily opf ON opf.oid = opc.opcfamily
      JOIN pg_catalog.pg_namespace ofn ON ofn.oid = opf.opfnamespace
      JOIN pg_catalog.pg_am oam ON oam.oid = opc.opcmethod
      JOIN pg_catalog.pg_proc hp ON hp.oid = oam.amhandler
      JOIN pg_catalog.pg_namespace hn ON hn.oid = hp.pronamespace
      JOIN pg_catalog.pg_language hl ON hl.oid = hp.prolang
      WHERE opn.nspname = 'pg_catalog' AND ofn.nspname = 'pg_catalog'
        AND oam.amname = 'btree' AND hn.nspname = 'pg_catalog'
        AND hp.proname = 'bthandler' AND hl.lanname = 'internal' AND opc.opcdefault
        AND ((opc.opcname = 'text_ops' AND opc.opcintype = 'pg_catalog.text'::pg_catalog.regtype)
          OR (opc.opcname = 'int4_ops' AND opc.opcintype = 'pg_catalog.int4'::pg_catalog.regtype))
        AND NOT (${INTERNAL_FAMILY_IS_UNSAFE})) <> 2) AS has_unsafe_dependency,
  (SELECT pg_catalog.md5(pg_catalog.string_agg(dep.kind || ':' || dep.oid, ',' ORDER BY dep.kind, dep.oid))
    FROM (SELECT 'text-eq'::text AS kind, op.oid::text AS oid
      FROM pg_catalog.pg_operator op JOIN pg_catalog.pg_namespace opn ON opn.oid = op.oprnamespace
      WHERE op.oprname = '=' AND op.oprleft = 'pg_catalog.text'::pg_catalog.regtype
        AND op.oprright = 'pg_catalog.text'::pg_catalog.regtype AND opn.nspname = 'pg_catalog'
      UNION ALL SELECT 'octet-length-text', p.oid::text FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace pn ON pn.oid = p.pronamespace WHERE pn.nspname = 'pg_catalog'
        AND p.proname = 'octet_length' AND p.proargtypes = '25'::pg_catalog.oidvector
      UNION ALL SELECT 'relation-am-handler', hp.oid::text FROM pg_catalog.pg_am ram
        JOIN pg_catalog.pg_proc hp ON hp.oid = ram.amhandler WHERE ram.oid = c.relam
      UNION ALL SELECT 'query-opclass', opc.oid::text FROM pg_catalog.pg_opclass opc
        JOIN pg_catalog.pg_namespace opn ON opn.oid = opc.opcnamespace
        WHERE opn.nspname = 'pg_catalog' AND opc.opcdefault
          AND ((opc.opcname = 'text_ops' AND opc.opcintype = 'pg_catalog.text'::pg_catalog.regtype)
            OR (opc.opcname = 'int4_ops' AND opc.opcintype = 'pg_catalog.int4'::pg_catalog.regtype))
      UNION ALL SELECT 'query-support', amp.amproc::text FROM pg_catalog.pg_amproc amp
        WHERE amp.amprocfamily IN (SELECT opc.opcfamily FROM pg_catalog.pg_opclass opc
          JOIN pg_catalog.pg_namespace opn ON opn.oid = opc.opcnamespace
          WHERE opn.nspname = 'pg_catalog' AND opc.opcdefault
            AND ((opc.opcname = 'text_ops' AND opc.opcintype = 'pg_catalog.text'::pg_catalog.regtype)
              OR (opc.opcname = 'int4_ops' AND opc.opcintype = 'pg_catalog.int4'::pg_catalog.regtype)))
      UNION ALL SELECT 'query-operator', amo.amopopr::text FROM pg_catalog.pg_amop amo
        WHERE amo.amopfamily IN (SELECT opc.opcfamily FROM pg_catalog.pg_opclass opc
          JOIN pg_catalog.pg_namespace opn ON opn.oid = opc.opcnamespace
          WHERE opn.nspname = 'pg_catalog' AND opc.opcdefault
            AND ((opc.opcname = 'text_ops' AND opc.opcintype = 'pg_catalog.text'::pg_catalog.regtype)
              OR (opc.opcname = 'int4_ops' AND opc.opcintype = 'pg_catalog.int4'::pg_catalog.regtype)))) dep)
    AS dependency_identity,
  (SELECT pg_catalog.md5(pg_catalog.string_agg(
    con.oid::text || ':' || con.contype::text || ':' || con.conkey::text || ':' ||
    con.convalidated::text || ':' || con.condeferrable::text || ':' || con.condeferred::text || ':' ||
    con.conparentid::text || ':' || (con.conbin IS NOT NULL)::text, ',' ORDER BY con.oid))
    FROM pg_catalog.pg_constraint con WHERE con.conrelid = c.oid) AS constraint_identity,
  (SELECT pg_catalog.md5(pg_catalog.string_agg(
    i.indexrelid::text || ':' || ic.relam::text || ':' || i.indisvalid::text || ':' ||
    i.indisready::text || ':' || i.indislive::text || ':' || i.indnkeyatts::text || ':' ||
    i.indnatts::text || ':' || i.indkey::text || ':' || i.indclass::text || ':' ||
    i.indcollation::text || ':' || (i.indexprs IS NOT NULL)::text || ':' ||
    (i.indpred IS NOT NULL)::text, ',' ORDER BY i.indexrelid))
    FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid
    WHERE i.indrelid = c.oid) AS index_identity,
  (SELECT pg_catalog.md5(pg_catalog.string_agg(dependency, ',' ORDER BY dependency)) FROM (
    SELECT i.indexrelid::text || ':am:' || iam.oid::text || ':handler:' || hp.oid::text AS dependency
      FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid
      JOIN pg_catalog.pg_am iam ON iam.oid = ic.relam JOIN pg_catalog.pg_proc hp ON hp.oid = iam.amhandler
      WHERE i.indrelid = c.oid
    UNION ALL
    SELECT i.indexrelid::text || ':key:' || pos::text || ':opclass:' || opc.oid::text ||
      ':family:' || opc.opcfamily::text || ':collation:' || (i.indcollation::oid[])[pos]::text
      FROM pg_catalog.pg_index i
      JOIN LATERAL pg_catalog.generate_subscripts(i.indkey::smallint[], 1) pos ON pos < i.indnkeyatts
      JOIN pg_catalog.pg_opclass opc ON opc.oid = (i.indclass::oid[])[pos] WHERE i.indrelid = c.oid
    UNION ALL
    SELECT i.indexrelid::text || ':support:' || amp.amproc::text
      FROM pg_catalog.pg_index i
      JOIN LATERAL pg_catalog.generate_subscripts(i.indkey::smallint[], 1) pos ON pos < i.indnkeyatts
      JOIN pg_catalog.pg_opclass opc ON opc.oid = (i.indclass::oid[])[pos]
      JOIN pg_catalog.pg_amproc amp ON amp.amprocfamily = opc.opcfamily WHERE i.indrelid = c.oid
    UNION ALL
    SELECT i.indexrelid::text || ':operator:' || amo.amopopr::text
      FROM pg_catalog.pg_index i
      JOIN LATERAL pg_catalog.generate_subscripts(i.indkey::smallint[], 1) pos ON pos < i.indnkeyatts
      JOIN pg_catalog.pg_opclass opc ON opc.oid = (i.indclass::oid[])[pos]
      JOIN pg_catalog.pg_amop amo ON amo.amopfamily = opc.opcfamily WHERE i.indrelid = c.oid
  ) dependencies) AS index_dependency_identity
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_catalog.pg_am am ON am.oid = c.relam
  JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  WHERE n.nspname = $1 AND c.relname = 'migration_history'
  ORDER BY a.attnum`;

function planBaselineMatches(rows, baseline) {
  if (!baseline?.exclusiveControl || !/^[a-f0-9]{64}$/.test(baseline.digest || '')) return false;
  const unsafe = rows.length !== 2 || rows.some((row) => row.relkind !== 'r'
    || row.relrowsecurity || row.relispartition || row.has_inheritance || row.has_rules
    || row.has_unsafe_column || row.has_default || row.has_unsafe_constraint || row.has_unsafe_index
    || row.has_unsafe_access_method || row.has_unsafe_opclass || row.has_unsafe_operator
    || !/^[a-f0-9]{32}$/.test(row.column_identity || '')
    || !/^[a-f0-9]{32}$/.test(row.index_identity || '')
    || !/^[a-f0-9]{32}$/.test(row.constraint_identity || '')
    || !/^[a-f0-9]{32}$/.test(row.index_dependency_identity || ''));
  return !unsafe && digest(rows) === baseline.digest;
}

function migrationBaselineMatches(rows, baseline) {
  if (!baseline?.exclusiveControl || !/^[a-f0-9]{64}$/.test(baseline.digest || '')
    || rows.length !== 4) return false;
  const expectedNames = ['manifest_ref', 'migration_id', 'migration_order', 'migration_hash'];
  const expectedTypes = ['25', '25', '23', '25'];
  const expectedCollations = ['100', '100', '0', '100'];
  const unsafe = rows.some((row, index) => row.relkind !== 'r' || row.relrowsecurity
    || row.relforcerowsecurity || row.relispartition || !row.relation_access_method_oid
    || row.relation_access_method !== 'heap' || !/^[a-f0-9]{32}$/.test(row.dependency_identity || '')
    || !/^[a-f0-9]{32}$/.test(row.constraint_identity || '')
    || !/^[a-f0-9]{32}$/.test(row.index_identity || '')
    || !/^[a-f0-9]{32}$/.test(row.index_dependency_identity || '')
    || row.has_rules || row.atthasdef || row.attgenerated || row.has_unsafe_column
    || row.has_unsafe_constraint || row.has_unsafe_index || row.has_unsafe_access_method
    || row.has_unsafe_opclass || row.has_unsafe_dependency || row.attname !== expectedNames[index]
    || row.type_oid !== expectedTypes[index] || row.collation_oid !== expectedCollations[index]);
  return !unsafe && digest(rows) === baseline.digest;
}

module.exports = {
  MIGRATION_BASELINE_SQL,
  PLAN_BASELINE_SQL,
  migrationBaselineMatches,
  planBaselineMatches,
};
