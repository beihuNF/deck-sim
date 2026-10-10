shader_type canvas_item;
render_mode blend_mix;

vec2 rotate(vec2 uv, vec2 pivot, float angle) {
	mat2 rotation = mat2(vec2(sin(angle), -cos(angle)),
						vec2(cos(angle), sin(angle)));

	uv -= pivot;
	uv = uv * rotation;
	uv += pivot;
	return uv;
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
float erosion_from_factors(vec2 factors, float input)
{
	return smoothstep(factors.x, factors.x + factors.y, input);
}

uniform vec4 blink_st;
uniform vec2 blink_smoothstep;

uniform sampler2D lut : repeat_disable;

uniform vec4 distortion_st;
uniform float distortion_offset;
uniform float distortion_intensity;

uniform vec2 smoothstep_factors;

varying vec4 vertex_color;

void vertex() {
	vertex_color = COLOR;
}

void fragment() {
	vec2 blink_uv = tiling_and_offset(UV, blink_st, vec2(0.0));

	vec2 polar_uv = polar_coordinates(UV, vec2(0.5, 0.5), 1.0, 1.0);
	polar_uv = tiling_and_offset(polar_uv, distortion_st, vec2(0.0));

	vec4 distortion_tex = texture(TEXTURE, polar_uv);
	vec2 distortion = UV + vec2((distortion_tex.b - 0.5) * 2.0 * distortion_offset) - vec2(0.5, 0.5);
	distortion *= distortion_tex.b;
	distortion *= -distortion_intensity;

	float blink = texture(TEXTURE, vec2(blink_uv.r, 0.0)).b;
	blink = erosion_from_factors(blink_smoothstep, blink);

	vec4 main_tex_distorted = texture(TEXTURE, UV + distortion);
	vec4 main_tex = texture(TEXTURE, UV);

	float lines = main_tex_distorted.r;

	float mask = erosion_from_factors(smoothstep_factors, main_tex.a);

	vec4 lut_tex = texture(lut, vec2(blink, 0.0));

	float glow = main_tex_distorted.g * lut_tex.a * blink;

	COLOR = vec4(lut_tex.rgb * vertex_color.rgb, vertex_color.a * max(lines, glow) * mask);
	//COLOR = vec4(vec3(blink), 1.0);
}
