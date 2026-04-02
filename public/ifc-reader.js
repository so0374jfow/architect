// ifc-reader.js — Import IFC files into the building model using web-ifc

import * as WebIFC from 'web-ifc';
import { initIfcEngine, getIfcApi } from './ifc-builder.js';

/**
 * Parse an IFC file (ArrayBuffer or Uint8Array) and return a building model
 * compatible with building-model.js data structure.
 */
export async function importIfcFile(fileData) {
  await initIfcEngine();
  const api = getIfcApi();

  const data = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);
  const modelID = api.OpenModel(data);

  if (modelID === -1) {
    throw new Error('Failed to open IFC file');
  }

  try {
    return extractBuildingModel(api, modelID);
  } finally {
    api.CloseModel(modelID);
  }
}

function extractBuildingModel(api, modelID) {
  const model = {
    name: 'Imported Building',
    units: 'meters',
    activeStorey: null,
    storeys: [],
  };

  // Try to get building name from IfcProject
  const projectIds = api.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT);
  if (projectIds.size() > 0) {
    const project = api.GetLine(modelID, projectIds.get(0), true);
    if (project.Name && project.Name.value) {
      model.name = project.Name.value;
    }
  }

  // Get all storeys
  const storeyIds = api.GetLineIDsWithType(modelID, WebIFC.IFCBUILDINGSTOREY);
  const storeyMap = new Map(); // expressID -> storey data

  for (let i = 0; i < storeyIds.size(); i++) {
    const storeyLine = api.GetLine(modelID, storeyIds.get(i), true);
    const storeyData = {
      id: `storey-imported-${i + 1}`,
      name: storeyLine.Name?.value || `Floor ${i + 1}`,
      elevation: storeyLine.Elevation?.value || 0,
      height: 3.0, // default, may be refined later
      walls: [],
    };
    model.storeys.push(storeyData);
    storeyMap.set(storeyIds.get(i), storeyData);
  }

  // If no storeys found, create a default one
  if (model.storeys.length === 0) {
    const defaultStorey = {
      id: 'storey-imported-1',
      name: 'Ground Floor',
      elevation: 0,
      height: 3.0,
      walls: [],
    };
    model.storeys.push(defaultStorey);
  }

  model.activeStorey = model.storeys[0].id;

  // Build a map of expressID -> storey for spatial containment
  const elementToStorey = new Map();
  const relContainIds = api.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
  for (let i = 0; i < relContainIds.size(); i++) {
    const rel = api.GetLine(modelID, relContainIds.get(i), false);
    const structureId = rel.RelatingStructure?.value;
    const storey = storeyMap.get(structureId);
    if (storey && rel.RelatedElements) {
      for (const elem of rel.RelatedElements) {
        const elemId = elem.value ?? elem;
        elementToStorey.set(elemId, storey);
      }
    }
  }

  // Build a map of wall expressID -> opening expressIDs (via IfcRelVoidsElement)
  const wallOpenings = new Map();
  const voidRelIds = api.GetLineIDsWithType(modelID, WebIFC.IFCRELVOIDSELEMENT);
  for (let i = 0; i < voidRelIds.size(); i++) {
    const rel = api.GetLine(modelID, voidRelIds.get(i), false);
    const wallId = rel.RelatingBuildingElement?.value;
    const openingId = rel.RelatedOpeningElement?.value;
    if (wallId && openingId) {
      if (!wallOpenings.has(wallId)) wallOpenings.set(wallId, []);
      wallOpenings.get(wallId).push(openingId);
    }
  }

  // Build a map of opening expressID -> filling element expressID (via IfcRelFillsElement)
  const openingFills = new Map();
  const fillRelIds = api.GetLineIDsWithType(modelID, WebIFC.IFCRELFILLSELEMENT);
  for (let i = 0; i < fillRelIds.size(); i++) {
    const rel = api.GetLine(modelID, fillRelIds.get(i), false);
    const openingId = rel.RelatingOpeningElement?.value;
    const elemId = rel.RelatedBuildingElement?.value;
    if (openingId && elemId) {
      openingFills.set(openingId, elemId);
    }
  }

  // Process walls
  const wallTypeIds = [WebIFC.IFCWALL, WebIFC.IFCWALLSTANDARDCASE];
  let wallCounter = 0;

  for (const typeId of wallTypeIds) {
    const wallIds = api.GetLineIDsWithType(modelID, typeId);
    for (let i = 0; i < wallIds.size(); i++) {
      const wallExpressID = wallIds.get(i);
      const wallLine = api.GetLine(modelID, wallExpressID, true);
      wallCounter++;

      // Determine which storey this wall belongs to
      let storey = elementToStorey.get(wallExpressID) || model.storeys[0];

      // Try to extract wall geometry
      const wallData = extractWallGeometry(api, modelID, wallLine, wallCounter);
      if (!wallData) continue;

      // Process openings for this wall
      const openingIds = wallOpenings.get(wallExpressID) || [];
      for (const openingExpressID of openingIds) {
        const openingLine = api.GetLine(modelID, openingExpressID, true);
        const fillElemId = openingFills.get(openingExpressID);

        let type = 'door';
        if (fillElemId) {
          const fillLine = api.GetLine(modelID, fillElemId, false);
          if (fillLine.type === WebIFC.IFCWINDOW) {
            type = 'window';
          }
        }

        const openingData = extractOpeningGeometry(openingLine, type, wallData);
        if (openingData) {
          wallData.openings.push(openingData);
        }
      }

      storey.walls.push(wallData);
    }
  }

  // Estimate storey heights from wall heights
  for (const storey of model.storeys) {
    if (storey.walls.length > 0) {
      const maxHeight = Math.max(...storey.walls.map(w => w.height));
      storey.height = maxHeight;
    }
  }

  return model;
}

function extractWallGeometry(api, modelID, wallLine, idx) {
  // Try to get wall placement and geometry to determine start/end/thickness/height
  try {
    const placement = wallLine.ObjectPlacement;
    let startX = 0, startY = 0;
    let dirAngle = 0;
    let length = 1, thickness = 0.2, height = 3.0;

    // Extract placement info
    if (placement) {
      const localPlacement = typeof placement === 'object' && placement.RelativePlacement
        ? placement
        : null;
      if (localPlacement && localPlacement.RelativePlacement) {
        const relPlace = localPlacement.RelativePlacement;
        if (relPlace.Location && relPlace.Location.Coordinates) {
          const coords = relPlace.Location.Coordinates;
          startX = coords[0]?.value ?? coords[0] ?? 0;
          startY = coords[1]?.value ?? coords[1] ?? 0;
        }
        if (relPlace.RefDirection && relPlace.RefDirection.DirectionRatios) {
          const ratios = relPlace.RefDirection.DirectionRatios;
          const rx = ratios[0]?.value ?? ratios[0] ?? 1;
          const ry = ratios[1]?.value ?? ratios[1] ?? 0;
          dirAngle = Math.atan2(ry, rx);
        }
      }
    }

    // Extract geometry (look for IfcExtrudedAreaSolid in representation)
    const rep = wallLine.Representation;
    if (rep && rep.Representations) {
      for (const shapeRep of rep.Representations) {
        const items = shapeRep.Items || [];
        for (const item of items) {
          if (item.type === WebIFC.IFCEXTRUDEDAREASOLID) {
            height = item.Depth?.value ?? item.Depth ?? 3.0;
            const profile = item.SweptArea;
            if (profile && profile.type === WebIFC.IFCRECTANGLEPROFILEDEF) {
              length = profile.XDim?.value ?? profile.XDim ?? 1;
              thickness = profile.YDim?.value ?? profile.YDim ?? 0.2;
            }
          }
        }
      }
    }

    // Calculate end point from start + direction + length
    const endX = startX + Math.cos(dirAngle) * length;
    const endY = startY + Math.sin(dirAngle) * length;

    return {
      id: `wall-imported-${idx}`,
      start: { x: +startX.toFixed(4), y: +startY.toFixed(4) },
      end: { x: +endX.toFixed(4), y: +endY.toFixed(4) },
      thickness: +thickness.toFixed(3),
      height: +height.toFixed(3),
      openings: [],
    };
  } catch (err) {
    console.warn('Failed to extract wall geometry:', err);
    return null;
  }
}

function extractOpeningGeometry(openingLine, type, wallData) {
  try {
    let position = 0;
    let width = type === 'window' ? 1.2 : 0.9;
    let height = type === 'window' ? 1.2 : 2.1;
    let sillHeight = type === 'window' ? 0.9 : 0;

    // Extract placement relative to wall
    const placement = openingLine.ObjectPlacement;
    if (placement && placement.RelativePlacement) {
      const relPlace = placement.RelativePlacement;
      if (relPlace.Location && relPlace.Location.Coordinates) {
        const coords = relPlace.Location.Coordinates;
        position = coords[0]?.value ?? coords[0] ?? 0;
        sillHeight = coords[2]?.value ?? coords[2] ?? sillHeight;
      }
    }

    // Extract geometry for dimensions
    const rep = openingLine.Representation;
    if (rep && rep.Representations) {
      for (const shapeRep of rep.Representations) {
        const items = shapeRep.Items || [];
        for (const item of items) {
          if (item.type === WebIFC.IFCEXTRUDEDAREASOLID) {
            height = item.Depth?.value ?? item.Depth ?? height;
            const profile = item.SweptArea;
            if (profile && profile.type === WebIFC.IFCRECTANGLEPROFILEDEF) {
              width = profile.XDim?.value ?? profile.XDim ?? width;
            }
          }
        }
      }
    }

    return {
      id: `${type}-imported-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      position: +position.toFixed(4),
      width: +width.toFixed(3),
      height: +height.toFixed(3),
      sillHeight: +sillHeight.toFixed(3),
    };
  } catch (err) {
    console.warn('Failed to extract opening geometry:', err);
    return null;
  }
}
