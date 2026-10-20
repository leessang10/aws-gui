import type { ApiSchema } from "../src/api-schema";
export const apiSchema: ApiSchema = {
  root: "Input",
  shapes: {
    Input: {
      type: "structure",
      required: ["Name"],
      members: {
        Name: {
          shape: "Name",
          documentation: "<p>The name of the resource.</p>",
        },
        Count: {
          shape: "Count",
          documentation: "<p>Number of resources, from 0 to 100.</p>",
        },
        Enabled: {
          shape: "Boolean",
          documentation: "<p>Whether the feature is enabled.</p>",
        },
        Mode: { shape: "Mode" },
        Tags: {
          shape: "Tags",
          documentation: "<p>Tags assigned to the resource.</p>",
        },
        Metadata: { shape: "Map" },
      },
    },
    Name: { type: "string", min: 1 },
    String: { type: "string" },
    Count: { type: "integer", min: 0, max: 100 },
    Boolean: { type: "boolean" },
    Mode: { type: "string", enum: ["standard", "enhanced"] },
    Tags: { type: "list", member: { shape: "Tag" } },
    Tag: {
      type: "structure",
      required: ["Key"],
      members: { Key: { shape: "Name" }, Value: { shape: "String" } },
    },
    Map: { type: "map", key: { shape: "Name" }, value: { shape: "String" } },
  },
};
