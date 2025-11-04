// ===================================================
// TWO-PART BOX: base shell + top plate (lid)
// Inside: 190 × 80 × 40 mm
// Wall thickness: 5 mm
// Top plate thickness: 5 mm
// Rounded outer edges only (vertical edges)
// Source ChatGPT 30.10.2025
// ===================================================

// ---------- Parameters ----------
innerLen = 190;
innerWid = 80;
innerH   = 40;
wall     = 5;
bottomT  = 5;
lidT     = 5;
footH    = 3;
footDia  = 8;
edgeR    = 4;   // 🔸 corner radius (outer edges only)

// ---------- Cable Cutout ----------
cutout_x_start = 115;
cutout_x_end   = 185;
cutout_height  = 15;
cutout_offsetZ = 25;
cutout_wall    = "back";

// ---------- Ventilation Rectangles ----------
vent_x_start = 110;
vent_x_end   = 180;
vent_y_start = 25;
vent_y_end   = 50;
vent_count   = 5;
vent_height  = 2.5;
vent_spacing = 2.5;

// ---------- Top Plate Ventilation ----------
top_vent_x_start = 120;
top_vent_x_end   = 170;
top_vent_y_start = 25;
top_vent_y_end   = 50;
top_vent_count   = 8;
top_vent_height  = 2.5;
top_vent_spacing = 2.5;

// ---------- Speaker Cutouts ----------
speaker_x_start = 2;
speaker_x_end   = 15;
speaker_y_start = 0;
speaker_y_end   = 80;
speaker_count   = 8;
speaker_height  = 2.5;
speaker_spacing = 2.5;

// ---------- Center Cutout ----------
center_cutout_len = 30;
center_cutout_wid = 70;
center_cutout_offsetX = 95;
center_cutout_offsetY = 45;

// ---------- Derived ----------
outerLen = innerLen + 2*wall;
outerWid = innerWid + 2*wall;
outerH   = bottomT + innerH;
eps = 0.5;

// ===================================================
// MAIN SWITCHES
// ===================================================
show_base = false;
show_lid  = true;

// ===================================================
// MODULE: ROUNDED OUTER SHELL (4 corners only)
// ===================================================
module roundedOuterBox(len, wid, h, r) {
    hull() {
        translate([r, r, 0])             cylinder(h=h, r=r, $fn=64);
        translate([len - r, r, 0])       cylinder(h=h, r=r, $fn=64);
        translate([r, wid - r, 0])       cylinder(h=h, r=r, $fn=64);
        translate([len - r, wid - r, 0]) cylinder(h=h, r=r, $fn=64);
    }
}

// ===================================================
// MODULE: BASE BOX (lifted by foot height)
// ===================================================
module baseBox() {
    translate([0, 0, footH])
    difference() {
        // Outer rounded shell (4 main vertical edges)
        roundedOuterBox(outerLen, outerWid, outerH, edgeR);

        // Inner cavity (regular rectangular cut)
        translate([wall, wall, bottomT])
            cube([innerLen, innerWid, innerH + eps]);

        // Cable cutout
        if (cutout_wall == "front") {
            translate([cutout_x_start, -eps, outerH - cutout_offsetZ - cutout_height])
                cube([cutout_x_end - cutout_x_start, wall + 2*eps, cutout_height]);
        } else if (cutout_wall == "back") {
            translate([cutout_x_start, outerWid - wall - eps, outerH - cutout_offsetZ - cutout_height])
                cube([cutout_x_end - cutout_x_start, wall + 2*eps, cutout_height]);
        }

        // Bottom ventilation slots
        vent_area_height = vent_y_end - vent_y_start;
        total_slot_height = vent_count * vent_height + (vent_count - 1) * vent_spacing;
        vent_y_offset = vent_y_start + (vent_area_height - total_slot_height) / 2;

        for (i = [0 : vent_count - 1]) {
            slot_y = vent_y_offset + i * (vent_height + vent_spacing);
            translate([vent_x_start, slot_y, -eps])
                cube([vent_x_end - vent_x_start, vent_height, bottomT + 2*eps]);
        }
    }

    // Feet
    foot(5, 5);
    foot(outerLen - 5, 5);
    foot(5, outerWid - 5);
    foot(outerLen - 5, outerWid - 5);
}

// ===================================================
// MODULE: FOOT
// ===================================================
module foot(x, y) {
    translate([x, y, 0])
        cylinder(h = footH, d = footDia, $fn = 48);
}

// ===================================================
// MODULE: TOP PLATE (lid)
// ===================================================
module topPlate() {
    translate([0, 0, outerH + footH + 20]) {
        difference() {
            // Rounded top plate (outer corners only)
            roundedOuterBox(outerLen, outerWid, lidT, edgeR);

            // Top ventilation slots
            vent_area_height = top_vent_y_end - top_vent_y_start;
            total_slot_height = top_vent_count * top_vent_height + (top_vent_count - 1) * top_vent_spacing;
            vent_y_offset = top_vent_y_start + (vent_area_height - total_slot_height) / 2;

            for (i = [0 : top_vent_count - 1]) {
                slot_y = vent_y_offset + i * (top_vent_height + top_vent_spacing);
                translate([top_vent_x_start + 20, slot_y, -eps])
                    cube([top_vent_x_end - top_vent_x_start - 20, top_vent_height, lidT + 2*eps]);
            }

            // Speaker slots
            total_slot_height = speaker_count * speaker_height + (speaker_count - 1) * speaker_spacing;
            speaker_y_offset = (outerWid - total_slot_height) / 2;

            for (i = [0 : speaker_count - 1]) {
                slot_y = speaker_y_offset + i * (speaker_height + speaker_spacing);
                translate([speaker_x_start, slot_y, -eps])
                    cube([speaker_x_end - speaker_x_start, speaker_height, lidT + 2*eps]);
            }

            // Center cutout
            translate([center_cutout_offsetX - center_cutout_len/2,
                       center_cutout_offsetY - center_cutout_wid/2,
                       -eps])
                cube([center_cutout_len, center_cutout_wid, lidT + 2*eps]);
        }
    }
}

// ===================================================
// OUTPUT
// ===================================================
if (show_base) baseBox();
if (show_lid) topPlate();
