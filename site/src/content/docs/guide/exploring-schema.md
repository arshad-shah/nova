---
title: Exploring your schema
description: The schema browser, ER diagrams, table previews, the inspector, and charts.
sidebar:
  order: 4
---

Beyond running queries, Verql helps you *understand* a database: what tables
exist, how they relate, and what's inside them. This page covers the schema
browser, ER diagrams, table previews, the inspector, and charts.

[← Back to the User Guide](/guide/)

## The schema browser

When you connect, Verql introspects the database and shows its structure in the
sidebar — tables, views, columns, indexes, and more (exact coverage varies by
database). Expand items to drill into the detail.

The schema is cached per connection for speed and cleared when you disconnect,
so a fresh connection always reflects the live database.

## ER diagrams

Verql can render an **entity-relationship diagram** of your schema, drawn with
[xyflow](https://xyflow.com/). Tables appear as nodes and foreign-key
relationships as the edges between them, so you can see at a glance how things
connect. Pan and zoom to explore large schemas.

## Table previews

To peek at a table's contents without writing a query, open a **table
preview** from the schema browser. Verql asks the active driver's own reader —
the same one export uses — for the table's rows and shows them in the same
results grid you get from queries, so you can sort, select, and inspect just
like query output.

## The inspector panel

The **inspector** reflects whatever you currently have selected — a row or a
schema object — and lays out its details in a readable form. Select a row in
any grid to see its full set of values, which is handy when a row is too wide
to read comfortably across the grid.

## Chart panel

The **chart panel**, built with [swift-chart](https://www.npmjs.com/package/@arshad-shah/swift-chart),
turns query results into a quick visualisation — a fast way to eyeball trends
or distributions without leaving the app. Run a query, then send its results
to the chart panel to plot them.

---

Next: [Importing & exporting data →](/guide/import-export/)
