shader_type canvas_item;
render_mode blend_mix;

float erosion_from_factors(vec2 factors, float input)
{
	return smoothstep(factors.x, factors.x + factors.y, input);
}
vec2 polar_coordinates(vec2 uv, vec2 center, float zoom, float repeat)
{
	vec2 dir = uv - center;
	float radius = length(dir) * 2.0;
	float angle = atan(dir.y, dir.x) * 1.0/(3.1416 * 2.0);
	return mod(vec2(radius * zoom, angle * repeat), 1.0);
}
vec2 tiling_and_offset(vec2 base_uv, vec4 st, vec2 initial_offset) {
	return (
		(base_uv * st.xy) +
		((st.zw * TIME) + initial_offset)
		);
}

uniform vec4 main_st;
uniform vec2 mask_erosion;

uniform sampler2D lut : repeat_disable;
uniform sampler2D mask : repeat_disable;

varying vec4 vertex_color;

void vertex() {
	vertex_color = COLOR;
}

void fragment() {
	vec2 polar_uv = polar_coordinates(UV, vec2(0.5, 0.5), 1.0, 1.0);
	polar_uv = tiling_and_offset(polar_uv, main_st, vec2(0.0));

	vec4 main_tex = texture(TEXTURE, polar_uv);
	vec4 mask_tex = texture(mask, UV);

	float alpha = vertex_color.a * mask_tex.a;
	alpha = erosion_from_factors(vec2(mask_erosion.x, mask_erosion.y), alpha);

	COLOR = vec4((main_tex * vertex_color).rgb, alpha);
}
