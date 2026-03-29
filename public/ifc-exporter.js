// ifc-exporter.js — Generate IFC-SPF (IFC4) files via string templates
// Produces valid IFC files that can be opened in BIMvision, xBIM, Blender, etc.

let _eid = 0;
function eid() { return ++_eid; }

function ifcStr(s) { return `'${(s || '').replace(/'/g, "''")}'`; }
function ifcFloat(n) { return Number(n).toExponential().toUpperCase().replace('+', ''); }
function ifcPoint(x, y, z) { return `#${eid()}=IFCCARTESIANPOINT((${ifcFloat(x)},${ifcFloat(y)},${ifcFloat(z)}))` }
function ifcPoint2D(x, y) { return `#${eid()}=IFCCARTESIANPOINT((${ifcFloat(x)},${ifcFloat(y)}))` }
function ifcDir(x, y, z) { return `#${eid()}=IFCDIRECTION((${ifcFloat(x)},${ifcFloat(y)},${ifcFloat(z)}))` }

export function exportIFC(model) {
  _eid = 0;
  const lines = [];
  const add = (line) => lines.push(line);

  // ── Header ──
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];

  lines.push("ISO-10303-21;");
  lines.push("HEADER;");
  lines.push(`FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');`);
  lines.push(`FILE_NAME('${model.name || 'building'}.ifc','${timestamp}',('Architect Tool'),(''),'',' ','');`);
  lines.push(`FILE_SCHEMA(('IFC4'));`);
  lines.push("ENDSEC;");
  lines.push("DATA;");

  // ── Shared definitions ──
  const originId = eid();
  add(`#${originId}=IFCCARTESIANPOINT((0.,0.,0.))`);

  const dirZid = eid();
  add(`#${dirZid}=IFCDIRECTION((0.,0.,1.))`);

  const dirXid = eid();
  add(`#${dirXid}=IFCDIRECTION((1.,0.,0.))`);

  const dirYid = eid();
  add(`#${dirYid}=IFCDIRECTION((0.,1.,0.))`);

  const worldPlacementId = eid();
  add(`#${worldPlacementId}=IFCAXIS2PLACEMENT3D(#${originId},#${dirZid},#${dirXid})`);

  const contextId = eid();
  add(`#${contextId}=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#${worldPlacementId},$)`);

  const subContextId = eid();
  add(`#${subContextId}=IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#${contextId},$,.MODEL_VIEW.,$)`);

  // Units
  const lengthUnitId = eid();
  add(`#${lengthUnitId}=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)`);
  const areaUnitId = eid();
  add(`#${areaUnitId}=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)`);
  const volumeUnitId = eid();
  add(`#${volumeUnitId}=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)`);
  const angleUnitId = eid();
  add(`#${angleUnitId}=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)`);

  const unitAssignId = eid();
  add(`#${unitAssignId}=IFCUNITASSIGNMENT((#${lengthUnitId},#${areaUnitId},#${volumeUnitId},#${angleUnitId}))`);

  // Owner history (minimal)
  const personId = eid();
  add(`#${personId}=IFCPERSON($,$,'',$,$,$,$,$)`);
  const orgId = eid();
  add(`#${orgId}=IFCORGANIZATION($,'Architect Tool',$,$,$)`);
  const personOrgId = eid();
  add(`#${personOrgId}=IFCPERSONANDORGANIZATION(#${personId},#${orgId},$)`);
  const appId = eid();
  add(`#${appId}=IFCAPPLICATION(#${orgId},'1.0','Architect Floorplan Tool','architect')`);
  const ownerHistId = eid();
  add(`#${ownerHistId}=IFCOWNERHISTORY(#${personOrgId},#${appId},$,.NOCHANGE.,$,$,$,${Math.floor(Date.now() / 1000)})`);

  // ── Project hierarchy ──
  const projectId = eid();
  add(`#${projectId}=IFCPROJECT('${guid()}',#${ownerHistId},${ifcStr(model.name)},$,$,$,$,(#${contextId}),#${unitAssignId})`);

  const sitePlacementId = eid();
  add(`#${sitePlacementId}=IFCLOCALPLACEMENT($,#${worldPlacementId})`);
  const siteId = eid();
  add(`#${siteId}=IFCSITE('${guid()}',#${ownerHistId},'Site',$,$,#${sitePlacementId},$,$,.ELEMENT.,$,$,$,$,$)`);

  const buildingPlacementId = eid();
  add(`#${buildingPlacementId}=IFCLOCALPLACEMENT(#${sitePlacementId},#${worldPlacementId})`);
  const buildingId = eid();
  add(`#${buildingId}=IFCBUILDING('${guid()}',#${ownerHistId},${ifcStr(model.name)},$,$,#${buildingPlacementId},$,$,.ELEMENT.,$,$,$)`);

  // Aggregation: project -> site -> building
  const relSiteId = eid();
  add(`#${relSiteId}=IFCRELAGGREGATES('${guid()}',#${ownerHistId},$,$,#${projectId},(#${siteId}))`);
  const relBuildId = eid();
  add(`#${relBuildId}=IFCRELAGGREGATES('${guid()}',#${ownerHistId},$,$,#${siteId},(#${buildingId}))`);

  // ── Storeys & elements ──
  const storeyIds = [];

  for (const storey of model.storeys) {
    const storeyElevation = storey.elevation || 0;

    // Storey placement
    const sPtId = eid();
    add(`#${sPtId}=IFCCARTESIANPOINT((0.,0.,${ifcFloat(storeyElevation)}))`);
    const sPlacement3dId = eid();
    add(`#${sPlacement3dId}=IFCAXIS2PLACEMENT3D(#${sPtId},#${dirZid},#${dirXid})`);
    const sLocalPlacementId = eid();
    add(`#${sLocalPlacementId}=IFCLOCALPLACEMENT(#${buildingPlacementId},#${sPlacement3dId})`);

    const storeyId = eid();
    add(`#${storeyId}=IFCBUILDINGSTOREY('${guid()}',#${ownerHistId},${ifcStr(storey.name)},$,$,#${sLocalPlacementId},$,$,.ELEMENT.,${ifcFloat(storeyElevation)})`);
    storeyIds.push(storeyId);

    // Elements in this storey
    const elementIds = [];

    for (const wall of storey.walls) {
      const wallElementIds = buildWallIFC(wall, storey, sLocalPlacementId, ownerHistId, subContextId, dirZid, dirXid, originId, add);
      elementIds.push(...wallElementIds);
    }

    // Contain elements in storey
    if (elementIds.length > 0) {
      const relContainId = eid();
      add(`#${relContainId}=IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid()}',#${ownerHistId},$,$,(${elementIds.map(id => '#' + id).join(',')}),#${storeyId})`);
    }
  }

  // Aggregate storeys into building
  if (storeyIds.length > 0) {
    const relStoreyId = eid();
    add(`#${relStoreyId}=IFCRELAGGREGATES('${guid()}',#${ownerHistId},$,$,#${buildingId},(${storeyIds.map(id => '#' + id).join(',')}))`);
  }

  lines.push("ENDSEC;");
  lines.push("END-ISO-10303-21;");

  return lines.join('\n');
}

function buildWallIFC(wall, storey, storeyPlacementId, ownerHistId, subContextId, dirZid, dirXid, originId, add) {
  const ids = [];
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return ids;

  const angle = Math.atan2(dy, dx);

  // Wall placement (relative to storey)
  const wallPtId = eid();
  add(`#${wallPtId}=IFCCARTESIANPOINT((${ifcFloat(wall.start.x)},${ifcFloat(wall.start.y)},0.))`);

  const wallDirId = eid();
  add(`#${wallDirId}=IFCDIRECTION((${ifcFloat(Math.cos(angle))},${ifcFloat(Math.sin(angle))},0.))`);

  const wallPlacement3dId = eid();
  add(`#${wallPlacement3dId}=IFCAXIS2PLACEMENT3D(#${wallPtId},#${dirZid},#${wallDirId})`);

  const wallLocalPlacementId = eid();
  add(`#${wallLocalPlacementId}=IFCLOCALPLACEMENT(#${storeyPlacementId},#${wallPlacement3dId})`);

  // Wall profile (rectangle along wall length)
  const profileOriginId = eid();
  add(`#${profileOriginId}=IFCCARTESIANPOINT((0.,0.))`);

  const profilePlacementId = eid();
  add(`#${profilePlacementId}=IFCAXIS2PLACEMENT2D(#${profileOriginId},$)`);

  const profileId = eid();
  add(`#${profileId}=IFCRECTANGLEPROFILEDEF(.AREA.,$,#${profilePlacementId},${ifcFloat(len)},${ifcFloat(wall.thickness)})`);

  // Extrude up
  const extrudeDirId = eid();
  add(`#${extrudeDirId}=IFCDIRECTION((0.,0.,1.))`);

  // Position the profile center at wall midpoint
  const profileOffsetPtId = eid();
  add(`#${profileOffsetPtId}=IFCCARTESIANPOINT((${ifcFloat(len / 2)},0.,0.))`);

  const extrudePlacementId = eid();
  add(`#${extrudePlacementId}=IFCAXIS2PLACEMENT3D(#${profileOffsetPtId},#${dirZid},#${dirXid})`);

  const solidId = eid();
  add(`#${solidId}=IFCEXTRUDEDAREASOLID(#${profileId},#${extrudePlacementId},#${extrudeDirId},${ifcFloat(wall.height)})`);

  const shapeRepId = eid();
  add(`#${shapeRepId}=IFCSHAPEREPRESENTATION(#${subContextId},'Body','SweptSolid',(#${solidId}))`);

  const prodDefId = eid();
  add(`#${prodDefId}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRepId}))`);

  const wallId = eid();
  add(`#${wallId}=IFCWALLSTANDARDCASE('${guid()}',#${ownerHistId},${ifcStr('Wall')},$,$,#${wallLocalPlacementId},#${prodDefId},$,$)`);
  ids.push(wallId);

  // Openings
  for (const opening of wall.openings) {
    const openingIds = buildOpeningIFC(opening, wall, wallId, wallLocalPlacementId, ownerHistId, subContextId, dirZid, dirXid, add);
    ids.push(...openingIds);
  }

  return ids;
}

function buildOpeningIFC(opening, wall, wallIfcId, wallPlacementId, ownerHistId, subContextId, dirZid, dirXid, add) {
  const ids = [];
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const wallLen = Math.sqrt(dx * dx + dy * dy);

  // Opening placement (relative to wall)
  const openPtId = eid();
  add(`#${openPtId}=IFCCARTESIANPOINT((${ifcFloat(opening.position)},0.,${ifcFloat(opening.sillHeight)}))`);

  const openPlacement3dId = eid();
  add(`#${openPlacement3dId}=IFCAXIS2PLACEMENT3D(#${openPtId},#${dirZid},#${dirXid})`);

  const openLocalPlacementId = eid();
  add(`#${openLocalPlacementId}=IFCLOCALPLACEMENT(#${wallPlacementId},#${openPlacement3dId})`);

  // Opening profile
  const opProfileOriginId = eid();
  add(`#${opProfileOriginId}=IFCCARTESIANPOINT((0.,0.))`);
  const opProfilePlacementId = eid();
  add(`#${opProfilePlacementId}=IFCAXIS2PLACEMENT2D(#${opProfileOriginId},$)`);
  const opProfileId = eid();
  add(`#${opProfileId}=IFCRECTANGLEPROFILEDEF(.AREA.,$,#${opProfilePlacementId},${ifcFloat(opening.width)},${ifcFloat(wall.thickness + 0.1)})`);

  // Extrude the opening void
  const opExtrudeDirId = eid();
  add(`#${opExtrudeDirId}=IFCDIRECTION((0.,0.,1.))`);

  const opExtrudePlacementId = eid();
  add(`#${opExtrudePlacementId}=IFCAXIS2PLACEMENT3D(#${opProfileOriginId},#${dirZid},#${dirXid})`);

  const opSolidId = eid();
  add(`#${opSolidId}=IFCEXTRUDEDAREASOLID(#${opProfileId},#${opExtrudePlacementId},#${opExtrudeDirId},${ifcFloat(opening.height)})`);

  const opShapeRepId = eid();
  add(`#${opShapeRepId}=IFCSHAPEREPRESENTATION(#${subContextId},'Body','SweptSolid',(#${opSolidId}))`);

  const opProdDefId = eid();
  add(`#${opProdDefId}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${opShapeRepId}))`);

  // IfcOpeningElement
  const openingElementId = eid();
  add(`#${openingElementId}=IFCOPENINGELEMENT('${guid()}',#${ownerHistId},'Opening',$,$,#${openLocalPlacementId},#${opProdDefId},$,$)`);

  // Void relationship
  const voidRelId = eid();
  add(`#${voidRelId}=IFCRELVOIDSELEMENT('${guid()}',#${ownerHistId},$,$,#${wallIfcId},#${openingElementId})`);

  // Door or Window element
  const elemId = eid();
  if (opening.type === 'door') {
    add(`#${elemId}=IFCDOOR('${guid()}',#${ownerHistId},'Door',$,$,#${openLocalPlacementId},$,$,${ifcFloat(opening.height)},${ifcFloat(opening.width)},$,$,$)`);
  } else {
    add(`#${elemId}=IFCWINDOW('${guid()}',#${ownerHistId},'Window',$,$,#${openLocalPlacementId},$,$,${ifcFloat(opening.height)},${ifcFloat(opening.width)},$,$,$)`);
  }
  ids.push(elemId);

  // Fill relationship
  const fillRelId = eid();
  add(`#${fillRelId}=IFCRELFILLSELEMENT('${guid()}',#${ownerHistId},$,$,#${openingElementId},#${elemId})`);

  return ids;
}

// Simple IFC GUID generator (22-char base64)
function guid() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  let result = '';
  for (let i = 0; i < 22; i++) {
    result += chars[Math.floor(Math.random() * 64)];
  }
  return result;
}

// Download helper
export function downloadIFC(model) {
  const content = exportIFC(model);
  const blob = new Blob([content], { type: 'application/x-step' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(model.name || 'building').replace(/\s+/g, '_')}.ifc`;
  a.click();
  URL.revokeObjectURL(url);
}
