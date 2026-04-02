// ifc-builder.js — Build IFC models programmatically using web-ifc
// Replaces the old string-template approach with proper API calls

import * as WebIFC from 'web-ifc';

let ifcApi = null;

/** Initialize the web-ifc WASM engine. Call once before using other functions. */
export async function initIfcEngine() {
  if (ifcApi) return ifcApi;
  ifcApi = new WebIFC.IfcAPI();
  ifcApi.SetWasmPath('./');
  await ifcApi.Init();
  return ifcApi;
}

/** Get the initialized IfcAPI instance */
export function getIfcApi() {
  return ifcApi;
}

/**
 * Convert a building model into an in-memory IFC model using web-ifc.
 * Returns { modelID, ifcApi } for further operations (save, get geometry, etc.)
 */
export function buildIfcModel(model) {
  const api = ifcApi;
  if (!api) throw new Error('IFC engine not initialized. Call initIfcEngine() first.');

  const modelID = api.CreateModel({ schema: 'IFC2X3' });

  // Helper to write an entity and return its expressID
  function write(entity) {
    api.WriteLine(modelID, entity);
    return entity.expressID;
  }

  // Helper to create a Handle reference
  function ref(expressID) {
    return new WebIFC.Handle(expressID);
  }

  // ── Shared geometry primitives ──

  const origin = new WebIFC.IFC2X3.IfcCartesianPoint([0, 0, 0]);
  write(origin);

  const dirZ = new WebIFC.IFC2X3.IfcDirection([0, 0, 1]);
  write(dirZ);

  const dirX = new WebIFC.IFC2X3.IfcDirection([1, 0, 0]);
  write(dirX);

  const dirY = new WebIFC.IFC2X3.IfcDirection([0, 1, 0]);
  write(dirY);

  const worldPlacement = new WebIFC.IFC2X3.IfcAxis2Placement3D(
    ref(origin.expressID), ref(dirZ.expressID), ref(dirX.expressID)
  );
  write(worldPlacement);

  // ── Geometric representation context ──

  const context = new WebIFC.IFC2X3.IfcGeometricRepresentationContext(
    null,
    new WebIFC.IFC2X3.IfcLabel('Model'),
    3,
    1e-5,
    ref(worldPlacement.expressID),
    null
  );
  write(context);

  const subContext = new WebIFC.IFC2X3.IfcGeometricRepresentationSubContext(
    new WebIFC.IFC2X3.IfcLabel('Body'),
    new WebIFC.IFC2X3.IfcLabel('Model'),
    ref(context.expressID),
    null,
    WebIFC.IFC2X3.IfcGeometricProjectionEnum.MODEL_VIEW,
    null
  );
  write(subContext);

  // ── Units ──

  const lengthUnit = new WebIFC.IFC2X3.IfcSIUnit(
    WebIFC.IFC2X3.IfcUnitEnum.LENGTHUNIT, null, WebIFC.IFC2X3.IfcSIUnitName.METRE
  );
  write(lengthUnit);

  const areaUnit = new WebIFC.IFC2X3.IfcSIUnit(
    WebIFC.IFC2X3.IfcUnitEnum.AREAUNIT, null, WebIFC.IFC2X3.IfcSIUnitName.SQUARE_METRE
  );
  write(areaUnit);

  const volumeUnit = new WebIFC.IFC2X3.IfcSIUnit(
    WebIFC.IFC2X3.IfcUnitEnum.VOLUMEUNIT, null, WebIFC.IFC2X3.IfcSIUnitName.CUBIC_METRE
  );
  write(volumeUnit);

  const angleUnit = new WebIFC.IFC2X3.IfcSIUnit(
    WebIFC.IFC2X3.IfcUnitEnum.PLANEANGLEUNIT, null, WebIFC.IFC2X3.IfcSIUnitName.RADIAN
  );
  write(angleUnit);

  const unitAssignment = new WebIFC.IFC2X3.IfcUnitAssignment([
    ref(lengthUnit.expressID),
    ref(areaUnit.expressID),
    ref(volumeUnit.expressID),
    ref(angleUnit.expressID),
  ]);
  write(unitAssignment);

  // ── Owner history ──

  const person = new WebIFC.IFC2X3.IfcPerson(
    null, null, new WebIFC.IFC2X3.IfcLabel(''), null, null, null, null, null
  );
  write(person);

  const org = new WebIFC.IFC2X3.IfcOrganization(
    null, new WebIFC.IFC2X3.IfcLabel('Architect Tool'), null, null, null
  );
  write(org);

  const personOrg = new WebIFC.IFC2X3.IfcPersonAndOrganization(
    ref(person.expressID), ref(org.expressID), null
  );
  write(personOrg);

  const application = new WebIFC.IFC2X3.IfcApplication(
    ref(org.expressID),
    new WebIFC.IFC2X3.IfcLabel('1.0'),
    new WebIFC.IFC2X3.IfcLabel('Architect Floorplan Tool'),
    new WebIFC.IFC2X3.IfcIdentifier('architect')
  );
  write(application);

  const ownerHistory = new WebIFC.IFC2X3.IfcOwnerHistory(
    ref(personOrg.expressID),
    ref(application.expressID),
    null,
    WebIFC.IFC2X3.IfcChangeActionEnum.NOCHANGE,
    null, null, null,
    Math.floor(Date.now() / 1000)
  );
  write(ownerHistory);

  // ── Project hierarchy ──

  const guid = () => api.CreateIFCGloballyUniqueId(modelID);

  const project = new WebIFC.IFC2X3.IfcProject(
    guid(),
    ref(ownerHistory.expressID),
    new WebIFC.IFC2X3.IfcLabel(model.name || 'Untitled'),
    null, null, null, null,
    [ref(context.expressID)],
    ref(unitAssignment.expressID)
  );
  write(project);

  const sitePlacement = new WebIFC.IFC2X3.IfcLocalPlacement(
    null, ref(worldPlacement.expressID)
  );
  write(sitePlacement);

  const site = new WebIFC.IFC2X3.IfcSite(
    guid(), ref(ownerHistory.expressID),
    new WebIFC.IFC2X3.IfcLabel('Site'),
    null, null,
    ref(sitePlacement.expressID),
    null, null,
    WebIFC.IFC2X3.IfcElementCompositionEnum.ELEMENT,
    null, null, null, null, null
  );
  write(site);

  const buildingPlacement = new WebIFC.IFC2X3.IfcLocalPlacement(
    ref(sitePlacement.expressID), ref(worldPlacement.expressID)
  );
  write(buildingPlacement);

  const building = new WebIFC.IFC2X3.IfcBuilding(
    guid(), ref(ownerHistory.expressID),
    new WebIFC.IFC2X3.IfcLabel(model.name || 'Building'),
    null, null,
    ref(buildingPlacement.expressID),
    null, null,
    WebIFC.IFC2X3.IfcElementCompositionEnum.ELEMENT,
    null, null, null
  );
  write(building);

  // Project -> Site -> Building aggregation
  const relSite = new WebIFC.IFC2X3.IfcRelAggregates(
    guid(), ref(ownerHistory.expressID), null, null,
    ref(project.expressID), [ref(site.expressID)]
  );
  write(relSite);

  const relBuilding = new WebIFC.IFC2X3.IfcRelAggregates(
    guid(), ref(ownerHistory.expressID), null, null,
    ref(site.expressID), [ref(building.expressID)]
  );
  write(relBuilding);

  // ── Storeys & elements ──

  const storeyRefs = [];

  for (const storey of model.storeys) {
    const storeyElevation = storey.elevation || 0;

    // Storey placement
    const sPt = new WebIFC.IFC2X3.IfcCartesianPoint([0, 0, storeyElevation]);
    write(sPt);

    const sPlacement3d = new WebIFC.IFC2X3.IfcAxis2Placement3D(
      ref(sPt.expressID), ref(dirZ.expressID), ref(dirX.expressID)
    );
    write(sPlacement3d);

    const sLocalPlacement = new WebIFC.IFC2X3.IfcLocalPlacement(
      ref(buildingPlacement.expressID), ref(sPlacement3d.expressID)
    );
    write(sLocalPlacement);

    const storeyEntity = new WebIFC.IFC2X3.IfcBuildingStorey(
      guid(), ref(ownerHistory.expressID),
      new WebIFC.IFC2X3.IfcLabel(storey.name || 'Storey'),
      null, null,
      ref(sLocalPlacement.expressID),
      null, null,
      WebIFC.IFC2X3.IfcElementCompositionEnum.ELEMENT,
      storeyElevation
    );
    write(storeyEntity);
    storeyRefs.push(ref(storeyEntity.expressID));

    // Elements in this storey
    const elementRefs = [];

    for (const wall of storey.walls) {
      const wallRefs = buildWall(api, modelID, wall, sLocalPlacement, ownerHistory, subContext, dirZ, dirX, origin, guid, ref, write);
      elementRefs.push(...wallRefs);
    }

    // Contain elements in storey
    if (elementRefs.length > 0) {
      const relContain = new WebIFC.IFC2X3.IfcRelContainedInSpatialStructure(
        guid(), ref(ownerHistory.expressID), null, null,
        elementRefs,
        ref(storeyEntity.expressID)
      );
      write(relContain);
    }
  }

  // Aggregate storeys into building
  if (storeyRefs.length > 0) {
    const relStoreys = new WebIFC.IFC2X3.IfcRelAggregates(
      guid(), ref(ownerHistory.expressID), null, null,
      ref(building.expressID), storeyRefs
    );
    write(relStoreys);
  }

  return { modelID, api };
}

function buildWall(api, modelID, wall, storeyPlacement, ownerHistory, subContext, dirZ, dirX, origin, guid, ref, write) {
  const refs = [];
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return refs;

  const angle = Math.atan2(dy, dx);

  // Wall placement
  const wallPt = new WebIFC.IFC2X3.IfcCartesianPoint([wall.start.x, wall.start.y, 0]);
  write(wallPt);

  const wallDir = new WebIFC.IFC2X3.IfcDirection([Math.cos(angle), Math.sin(angle), 0]);
  write(wallDir);

  const wallPlacement3d = new WebIFC.IFC2X3.IfcAxis2Placement3D(
    ref(wallPt.expressID), ref(dirZ.expressID), ref(wallDir.expressID)
  );
  write(wallPlacement3d);

  const wallLocalPlacement = new WebIFC.IFC2X3.IfcLocalPlacement(
    ref(storeyPlacement.expressID), ref(wallPlacement3d.expressID)
  );
  write(wallLocalPlacement);

  // Wall profile (rectangle along wall length)
  const profileOrigin = new WebIFC.IFC2X3.IfcCartesianPoint([0, 0]);
  write(profileOrigin);

  const profilePlacement = new WebIFC.IFC2X3.IfcAxis2Placement2D(
    ref(profileOrigin.expressID), null
  );
  write(profilePlacement);

  const profile = new WebIFC.IFC2X3.IfcRectangleProfileDef(
    WebIFC.IFC2X3.IfcProfileTypeEnum.AREA,
    null,
    ref(profilePlacement.expressID),
    len,
    wall.thickness
  );
  write(profile);

  // Extrude up
  const extrudeDir = new WebIFC.IFC2X3.IfcDirection([0, 0, 1]);
  write(extrudeDir);

  // Position profile center at wall midpoint
  const profileOffsetPt = new WebIFC.IFC2X3.IfcCartesianPoint([len / 2, 0, 0]);
  write(profileOffsetPt);

  const extrudePlacement = new WebIFC.IFC2X3.IfcAxis2Placement3D(
    ref(profileOffsetPt.expressID), ref(dirZ.expressID), ref(dirX.expressID)
  );
  write(extrudePlacement);

  const solid = new WebIFC.IFC2X3.IfcExtrudedAreaSolid(
    ref(profile.expressID),
    ref(extrudePlacement.expressID),
    ref(extrudeDir.expressID),
    wall.height
  );
  write(solid);

  const shapeRep = new WebIFC.IFC2X3.IfcShapeRepresentation(
    ref(subContext.expressID),
    new WebIFC.IFC2X3.IfcLabel('Body'),
    new WebIFC.IFC2X3.IfcLabel('SweptSolid'),
    [ref(solid.expressID)]
  );
  write(shapeRep);

  const prodDef = new WebIFC.IFC2X3.IfcProductDefinitionShape(null, null, [ref(shapeRep.expressID)]);
  write(prodDef);

  const wallEntity = new WebIFC.IFC2X3.IfcWallStandardCase(
    guid(), ref(ownerHistory.expressID),
    new WebIFC.IFC2X3.IfcLabel('Wall'),
    null, null,
    ref(wallLocalPlacement.expressID),
    ref(prodDef.expressID),
    null
  );
  write(wallEntity);
  refs.push(ref(wallEntity.expressID));

  // Openings
  for (const opening of wall.openings) {
    const openingRefs = buildOpening(api, modelID, opening, wall, wallEntity, wallLocalPlacement, ownerHistory, subContext, dirZ, dirX, guid, ref, write);
    refs.push(...openingRefs);
  }

  return refs;
}

function buildOpening(api, modelID, opening, wall, wallEntity, wallPlacement, ownerHistory, subContext, dirZ, dirX, guid, ref, write) {
  const refs = [];

  // Opening placement (relative to wall)
  const openPt = new WebIFC.IFC2X3.IfcCartesianPoint([opening.position, 0, opening.sillHeight]);
  write(openPt);

  const openPlacement3d = new WebIFC.IFC2X3.IfcAxis2Placement3D(
    ref(openPt.expressID), ref(dirZ.expressID), ref(dirX.expressID)
  );
  write(openPlacement3d);

  const openLocalPlacement = new WebIFC.IFC2X3.IfcLocalPlacement(
    ref(wallPlacement.expressID), ref(openPlacement3d.expressID)
  );
  write(openLocalPlacement);

  // Opening profile
  const opProfileOrigin = new WebIFC.IFC2X3.IfcCartesianPoint([0, 0]);
  write(opProfileOrigin);

  const opProfilePlacement = new WebIFC.IFC2X3.IfcAxis2Placement2D(
    ref(opProfileOrigin.expressID), null
  );
  write(opProfilePlacement);

  const opProfile = new WebIFC.IFC2X3.IfcRectangleProfileDef(
    WebIFC.IFC2X3.IfcProfileTypeEnum.AREA,
    null,
    ref(opProfilePlacement.expressID),
    opening.width,
    wall.thickness + 0.1
  );
  write(opProfile);

  // Extrude the opening void
  const opExtrudeDir = new WebIFC.IFC2X3.IfcDirection([0, 0, 1]);
  write(opExtrudeDir);

  const opExtrudePlacement = new WebIFC.IFC2X3.IfcAxis2Placement3D(
    ref(opProfileOrigin.expressID), ref(dirZ.expressID), ref(dirX.expressID)
  );
  write(opExtrudePlacement);

  const opSolid = new WebIFC.IFC2X3.IfcExtrudedAreaSolid(
    ref(opProfile.expressID),
    ref(opExtrudePlacement.expressID),
    ref(opExtrudeDir.expressID),
    opening.height
  );
  write(opSolid);

  const opShapeRep = new WebIFC.IFC2X3.IfcShapeRepresentation(
    ref(subContext.expressID),
    new WebIFC.IFC2X3.IfcLabel('Body'),
    new WebIFC.IFC2X3.IfcLabel('SweptSolid'),
    [ref(opSolid.expressID)]
  );
  write(opShapeRep);

  const opProdDef = new WebIFC.IFC2X3.IfcProductDefinitionShape(null, null, [ref(opShapeRep.expressID)]);
  write(opProdDef);

  // IfcOpeningElement
  const openingElement = new WebIFC.IFC2X3.IfcOpeningElement(
    guid(), ref(ownerHistory.expressID),
    new WebIFC.IFC2X3.IfcLabel('Opening'),
    null, null,
    ref(openLocalPlacement.expressID),
    ref(opProdDef.expressID),
    null
  );
  write(openingElement);

  // Void relationship
  const voidRel = new WebIFC.IFC2X3.IfcRelVoidsElement(
    guid(), ref(ownerHistory.expressID), null, null,
    ref(wallEntity.expressID),
    ref(openingElement.expressID)
  );
  write(voidRel);

  // Door or Window element
  let elem;
  if (opening.type === 'door') {
    elem = new WebIFC.IFC2X3.IfcDoor(
      guid(), ref(ownerHistory.expressID),
      new WebIFC.IFC2X3.IfcLabel('Door'),
      null, null,
      ref(openLocalPlacement.expressID),
      null, null,
      opening.height,
      opening.width
    );
  } else {
    elem = new WebIFC.IFC2X3.IfcWindow(
      guid(), ref(ownerHistory.expressID),
      new WebIFC.IFC2X3.IfcLabel('Window'),
      null, null,
      ref(openLocalPlacement.expressID),
      null, null,
      opening.height,
      opening.width
    );
  }
  write(elem);
  refs.push(ref(elem.expressID));

  // Fill relationship
  const fillRel = new WebIFC.IFC2X3.IfcRelFillsElement(
    guid(), ref(ownerHistory.expressID), null, null,
    ref(openingElement.expressID),
    ref(elem.expressID)
  );
  write(fillRel);

  return refs;
}

/**
 * Export a building model to an IFC file (Uint8Array).
 */
export function exportIfcBuffer(model) {
  const { modelID, api } = buildIfcModel(model);
  const data = api.SaveModel(modelID);
  api.CloseModel(modelID);
  return data;
}

/**
 * Download an IFC file for a building model.
 */
export async function downloadIfcFile(model) {
  await initIfcEngine();
  const data = exportIfcBuffer(model);
  const blob = new Blob([data], { type: 'application/x-step' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(model.name || 'building').replace(/\s+/g, '_')}.ifc`;
  a.click();
  URL.revokeObjectURL(url);
}
