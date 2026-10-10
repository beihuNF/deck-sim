shader_type canvas_item;
render_mode blend_mix;

float erosion_from_factors(vec2 factors, float input)
{
	return smoothstep(factors.x, factors.x + factors.y, input);
}
vec2 tiling_and_offset(vec2 base_uv, vec4 st, vec2 initial_offset) {
	return (
		(base_uv * st.xy) +
		((st.zw * TIME) + initial_offset)
		);
}
vec2 polar_coordinates(vec2 uv, vec2 center, float zoom, float repeat)
{
	vec2 dir = uv - center;
	float radius = length(dir) * 2.0;
	float angle = atan(dir.y, dir.x) * 1.0/(3.1416 * 2.0);
	return mod(vec2(radius * zoom, angle * repeat), 1.0);
}
vec2 rotate(vec2 uv, vec2 pivot, float angle) {
	mat2 rotation = mat2(vec2(sin(angle), -cos(angle)),
						vec2(cos(angle), sin(angle)));

	uv -= pivot;
	uv = uv * rotation;
	uv += pivot;
	return uv;
}

uniform vec2 pivot_offset = vec2(0.0, 0.0);

uniform vec4 main_st_a;
uniform vec4 main_st_b;

uniform vec2 main_st_a_initial_offset;
uniform vec2 main_st_b_initial_offset;

uniform vec2 erosion;

uniform float rotation_normalized = 0;

uniform sampler2D lut;
uniform sampler2D alpha_overlay;
uniform sampler2D mask;

varying vec4 modulate;

void vertex() {
	VERTEX += pivot_offset * (1.0/TEXTURE_PIXEL_SIZE);
	modulate = COLOR;
}

void fragment() {
	vec2 adjusted_uv = polar_coordinates(rotate(UV, vec2(0.5), PI * rotation_normalized), vec2(0.5), 1.0, 1.0);

	vec4 noise_a = texture(TEXTURE, tiling_and_offset(adjusted_uv, main_st_a, main_st_a_initial_offset));
	vec4 noise_b = texture(TEXTURE, tiling_and_offset(adjusted_uv, main_st_b, main_st_b_initial_offset));

	vec4 alpha_overlay_tex = texture(alpha_overlay, UV);
	vec4 mask_tex = texture(mask, UV);

	float noise_total = (noise_a.r + noise_b.r) * 0.5;
	noise_total += alpha_overlay_tex.b;
	noise_total *= mask_tex.r;
	noise_total = erosion_from_factors(erosion, noise_total);

	vec4 lut_tex = texture(lut, vec2(noise_total));

	COLOR = lut_tex;
	COLOR.a = noise_total;

	COLOR *= modulate;
}
